from core.credits import REID_COST_MULTIPLIER, apply_reid_multiplier


def test_multiplier_applied_only_with_targets():
    assert apply_reid_multiplier(100, has_targets=False) == 100
    assert apply_reid_multiplier(100, has_targets=True) == int(round(100 * REID_COST_MULTIPLIER))
