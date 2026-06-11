import pytest
from core.credits import estimate_cost


def test_estimate_basic():
    assert estimate_cost(30.0, 0.5) == 15


def test_estimate_ceiling():
    # 11 * 0.8 = 8.8 → ceil = 9
    assert estimate_cost(11.0, 0.8) == 9


def test_estimate_exact():
    # 10 * 0.8 = 8.0 → ceil = 8
    assert estimate_cost(10.0, 0.8) == 8


def test_estimate_zero():
    assert estimate_cost(0.0, 1.0) == 0


def test_estimate_one_second():
    assert estimate_cost(1.0, 1.0) == 1


def test_estimate_ppe():
    # 60s * 1.0 = 60 credits (exactly the free tier)
    assert estimate_cost(60.0, 1.0) == 60


def test_estimate_large():
    # 1 hour at cheapest rate
    assert estimate_cost(3600.0, 0.5) == 1800
