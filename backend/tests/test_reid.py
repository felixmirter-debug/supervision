import numpy as np

from routers.services._reid import appearance_embedding, TargetMatcher


def _patch(color):
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    frame[20:80, 20:60] = color
    return frame


def test_embedding_is_normalized():
    emb = appearance_embedding(_patch((0, 0, 255)), (20, 20, 60, 80))
    assert emb.ndim == 1
    assert abs(float(np.linalg.norm(emb)) - 1.0) < 1e-5


def test_matcher_reassociates_lost_target_by_appearance():
    red_frame = _patch((0, 0, 255))
    blue_frame = _patch((255, 0, 0))
    bbox = (20, 20, 60, 80)

    matcher = TargetMatcher()
    matcher.register(0, appearance_embedding(red_frame, bbox))
    matcher.bind(0, track_id=7, bbox=bbox)
    matcher.mark_lost(track_id=7)
    tid = matcher.match_new_track(
        appearance_embedding(red_frame, bbox), bbox=bbox, track_id=99
    )
    assert tid == 0

    matcher2 = TargetMatcher()
    matcher2.register(0, appearance_embedding(red_frame, bbox))
    matcher2.bind(0, track_id=7, bbox=bbox)
    matcher2.mark_lost(track_id=7)
    assert matcher2.match_new_track(
        appearance_embedding(blue_frame, bbox), bbox=bbox, track_id=99
    ) is None


def test_bind_evicts_previous_track_of_same_target():
    m = TargetMatcher()
    m.bind(0, track_id=7, bbox=(0, 0, 10, 10))
    m.bind(0, track_id=9, bbox=(0, 0, 10, 10))
    assert m.target_for_track(7) is None
    assert m.target_for_track(9) == 0


def test_bind_evicts_previous_target_of_same_track():
    m = TargetMatcher()
    m.bind(0, track_id=7, bbox=(0, 0, 10, 10))
    m.bind(1, track_id=7, bbox=(0, 0, 10, 10))
    assert m.target_for_track(7) == 1


def test_matcher_spatial_gating_rejects_far_candidates():
    red_frame = _patch((0, 0, 255))
    bbox = (20, 20, 60, 80)
    matcher = TargetMatcher(max_center_dist_ratio=0.2)
    matcher.register(0, appearance_embedding(red_frame, bbox))
    matcher.bind(0, track_id=7, bbox=bbox)
    matcher.mark_lost(track_id=7)
    far_bbox = (900, 900, 940, 960)
    assert matcher.match_new_track(
        appearance_embedding(red_frame, bbox), bbox=far_bbox, track_id=99,
        frame_diag=141.4,
    ) is None
