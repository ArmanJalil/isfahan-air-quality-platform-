# -*- coding: utf-8 -*-
"""
model_hybrid.py  -  THE HYBRID: TFT mechanisms + LSTM + attention + physics
(Step 4 champion candidate)

Architecture (TFT-style, simplified):
  * Variable Selection Network (GRN-gated softmax over features) on the
    history window  -> learns which neighbors/weather matter
  * 2-layer LSTM encoder over selected embeddings
  * multi-head attention: decoder state queries encoder outputs
  * decoder LSTMCell per future step, fed [prev median, VSN(known-future_t),
    attention context]  -> anticipates weather-driven spikes
  * QUANTILE head (p10/p50/p90) with guaranteed ordering
Loss:
  * pinball (all 3 quantiles), NaN-masked, spike-weighted (1 + w*relu(t))
  * + physics on the MEDIAN in real units: non-negativity + per-pollutant
    rate-of-change limit

Run:   python model_hybrid.py --station 349 --pollutant PM2_5 --window 48
Needs: pip install torch scikit-learn pandas numpy matplotlib pyarrow
"""

import os
import argparse
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import aqf_common as C

SEED = 42
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

ROC_LIMIT = {"PM2_5": 150.0, "PM10": 500.0, "O3": 100.0, "CO": 15.0,
             "SO2": 150.0, "NO2": 150.0, "NO": 200.0, "NOx": 400.0}
QUANTILES = (0.1, 0.5, 0.9)


def seed_all(s=SEED):
    import random
    random.seed(s); np.random.seed(s); torch.manual_seed(s)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(s)


class DS(Dataset):
    def __init__(self, X, fut, y):
        self.X, self.fut, self.y = X, fut, y
    def __len__(self):
        return len(self.X)
    def __getitem__(self, i):
        return self.X[i], self.fut[i], self.y[i]


class GRN(nn.Module):
    """Gated Residual Network (TFT): dense -> ELU -> dense -> GLU + skip + LN."""
    def __init__(self, in_size, hidden, out_size, dropout=0.1):
        super().__init__()
        self.fc1 = nn.Linear(in_size, hidden)
        self.fc2 = nn.Linear(hidden, out_size)
        self.drop = nn.Dropout(dropout)
        self.gate = nn.Linear(out_size, out_size * 2)
        self.skip = nn.Linear(in_size, out_size) if in_size != out_size else nn.Identity()
        self.norm = nn.LayerNorm(out_size)
    def forward(self, x):
        h = self.drop(self.fc2(torch.nn.functional.elu(self.fc1(x))))
        a, b = self.gate(h).chunk(2, dim=-1)
        return self.norm(self.skip(x) + a * torch.sigmoid(b))


class VSN(nn.Module):
    """Variable Selection Network: per-feature embedding + GRN softmax weights."""
    def __init__(self, n_feat, d, dropout=0.1):
        super().__init__()
        self.W = nn.Parameter(torch.randn(n_feat, d) * 0.1)
        self.b = nn.Parameter(torch.zeros(n_feat, d))
        self.sel = GRN(n_feat, d, n_feat, dropout)
    def forward(self, x):
        e = x.unsqueeze(-1) * self.W + self.b
        w = torch.softmax(self.sel(x), dim=-1)
        return (e * w.unsqueeze(-1)).sum(-2), w


class HybridTFT(nn.Module):
    def __init__(self, n_hist, n_fut, horizon, d=96, heads=4, dropout=0.15):
        super().__init__()
        self.horizon = horizon
        self.vsn_h = VSN(n_hist, d, dropout)
        self.enc = nn.LSTM(d, d, num_layers=2, batch_first=True, dropout=dropout)
        self.attn = nn.MultiheadAttention(d, heads, dropout=dropout, batch_first=True)
        self.vsn_f = VSN(n_fut, d, dropout)
        self.dec = nn.LSTMCell(1 + d + d, d)
        self.drop = nn.Dropout(dropout)
        self.head = nn.Linear(d, 3)
    def forward(self, x, fut):
        eh, w_hist = self.vsn_h(x)
        enc_out, (h, c) = self.enc(eh)
        h, c = h[-1], c[-1]
        prev = x[:, -1, :1]
        outs = []
        for t in range(self.horizon):
            ef, _ = self.vsn_f(fut[:, t])
            ctx, _ = self.attn(h.unsqueeze(1), enc_out, enc_out)
            h, c = self.dec(torch.cat([prev, ef, ctx.squeeze(1)], dim=1), (h, c))
            o = self.head(self.drop(h))
            q10 = o[:, :1]
            q50 = q10 + torch.nn.functional.softplus(o[:, 1:2])
            q90 = q50 + torch.nn.functional.softplus(o[:, 2:3])
            outs.append(torch.stack([q10, q50, q90], dim=-1))
            prev = q50
        return torch.cat(outs, dim=1)


def hybrid_loss(pred, target, ysc, target_shift, pollutant,
                spike_w=1.0, phys_w=0.1):
    mask = ~torch.isnan(target)
    t = torch.where(mask, target, torch.zeros_like(target))
    w = 1.0 + spike_w * torch.relu(t)
    loss = 0.0
    for i, q in enumerate(QUANTILES):
        e = t - pred[..., i]
        pin = torch.maximum(q * e, (q - 1) * e)
        loss = loss + (w * pin * mask).sum() / mask.sum().clamp(min=1)

    med = pred[..., 1]
    mean = torch.tensor(ysc.mean_, device=med.device, dtype=med.dtype)
    std = torch.tensor(ysc.scale_, device=med.device, dtype=med.dtype)
    real = torch.expm1(med * std + mean) - (target_shift or 0.0)
    neg = torch.relu(-real).mean()
    d = real[:, 1:] - real[:, :-1]
    roc = torch.relu(d.abs() - ROC_LIMIT.get(pollutant, 200.0)).mean()
    return loss + phys_w * (neg + 0.01 * roc)


# NOTE: the full training/evaluation loop (data loading, early stopping,
# metric reporting, weight saving) lives in the original project alongside
# aqf_common.py. This file is included to show the model architecture and
# physics-informed quantile loss that are the core technical contribution.
if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--station", type=int, default=349)
    ap.add_argument("--pollutant", default="PM2_5")
    ap.add_argument("--window", type=int, default=48)
    ap.add_argument("--hidden", type=int, default=96)
    ap.add_argument("--heads", type=int, default=4)
    ap.add_argument("--dropout", type=float, default=0.15)
    print("HybridTFT defined. Wire this into the aqf_common training loop to train.")
