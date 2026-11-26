#!/bin/bash
# One-time setup: Python 3.12 venv, libraries, models, OBS (for the virtual camera).
set -e
cd "$(dirname "$0")"
brew list python@3.12 >/dev/null 2>&1 || brew install python@3.12
[ -d .venv ] || /opt/homebrew/bin/python3.12 -m venv .venv
.venv/bin/pip install -q --upgrade pip mediapipe opencv-python pyvirtualcam numpy torch diffusers transformers accelerate
[ -f selfie_multiclass.tflite ] || curl -sSLo selfie_multiclass.tflite https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite
[ -f hand_landmarker.task ] || curl -sSLo hand_landmarker.task https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
[ -f pose_landmarker.task ] || curl -sSLo pose_landmarker.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task
[ -d /Applications/OBS.app ] || brew install --cask obs
echo "Done. Run ./run.sh"
