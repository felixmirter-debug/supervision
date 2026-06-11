import os
from pathlib import Path
from types import SimpleNamespace

import pytest

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_SECRET_KEY", "test-key")

from routers.services import _pipeline


def test_write_video_transcodes_result_for_browser(monkeypatch, tmp_path):
    captured = {}

    def fake_write_mp4v_video(frames, fps, output_path):
        Path(output_path).write_bytes(b"raw-video")

    def fake_run(command, stdout, stderr, text, check):
        captured["command"] = command
        Path(command[-1]).write_bytes(b"browser-video")
        return SimpleNamespace(returncode=0, stderr="")

    monkeypatch.setattr(_pipeline, "_get_ffmpeg_exe", lambda: "ffmpeg")
    monkeypatch.setattr(_pipeline, "_write_mp4v_video", fake_write_mp4v_video)
    monkeypatch.setattr(_pipeline.subprocess, "run", fake_run)

    output_path = tmp_path / "result.mp4"
    _pipeline._write_video([object()], 30.0, str(output_path))

    assert output_path.read_bytes() == b"browser-video"
    command = captured["command"]
    assert command[command.index("-c:v") + 1] == "libx264"
    assert command[command.index("-pix_fmt") + 1] == "yuv420p"
    assert command[command.index("-movflags") + 1] == "+faststart"


def test_transcode_requires_ffmpeg(monkeypatch, tmp_path):
    input_path = tmp_path / "raw.mp4"
    output_path = tmp_path / "result.mp4"
    input_path.write_bytes(b"raw-video")
    monkeypatch.setattr(_pipeline, "_get_ffmpeg_exe", lambda: None)

    with pytest.raises(RuntimeError, match="FFmpeg is required"):
        _pipeline._transcode_for_browser(str(input_path), str(output_path))
