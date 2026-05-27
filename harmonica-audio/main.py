import os
import random
import tempfile
from urllib.parse import urlparse
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
import librosa

app = FastAPI(
    title="Harmonica Audio Analysis Service",
    description="Python microservice powered by Librosa & NumPy for detecting BPM, key, frequencies, and energy.",
    version="1.0"
)

class AnalysisRequest(BaseModel):
    track_id: str
    blob_url: str

class AnalysisResponse(BaseModel):
    track_id: str
    bpm: float
    musical_key: str
    camelot_key: str
    energy: float
    lows: float
    mids: float
    highs: float
    waveform: list[float]
    duration_seconds: float

def estimate_key(y, sr):
    """
    Estimates the musical key of the audio track using chromagram template matching
    against Krumhansl-Schmuckler profiles. Returns (musical_key, camelot_key).
    """
    try:
        # Compute chromagram
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_avg = chroma.mean(axis=1)
        
        # Krumhansl-Schmuckler profiles
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
        
        # Normalize profiles
        major_profile = (major_profile - np.mean(major_profile)) / np.std(major_profile)
        minor_profile = (minor_profile - np.mean(minor_profile)) / np.std(minor_profile)
        
        best_corr = -1.0
        best_key = "C"
        best_mode = "major"
        
        pitch_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        
        # Standardize chroma average
        chroma_avg_std = np.std(chroma_avg)
        if chroma_avg_std == 0:
            return "C", "8B"
        chroma_norm = (chroma_avg - np.mean(chroma_avg)) / chroma_avg_std
        
        for i in range(12):
            shifted_major = np.roll(major_profile, i)
            shifted_minor = np.roll(minor_profile, i)
            
            corr_major = np.corrcoef(chroma_norm, shifted_major)[0, 1]
            corr_minor = np.corrcoef(chroma_norm, shifted_minor)[0, 1]
            
            if not np.isnan(corr_major) and corr_major > best_corr:
                best_corr = corr_major
                best_key = pitch_names[i]
                best_mode = "major"
                
            if not np.isnan(corr_minor) and corr_minor > best_corr:
                best_corr = corr_minor
                best_key = pitch_names[i]
                best_mode = "minor"
        
        # Camelot mappings
        major_camelot = {
            "C": "8B", "G": "9B", "D": "10B", "A": "11B", "E": "12B", "B": "1B",
            "F#": "2B", "C#": "3B", "G#": "4B", "D#": "5B", "A#": "6B", "F": "7B"
        }
        minor_camelot = {
            "Am": "8A", "Em": "9A", "Bm": "10A", "F#m": "11A", "C#m": "12A", "G#m": "1A",
            "D#m": "2A", "A#m": "3A", "Fm": "4A", "Cm": "5A", "Gm": "6A", "Dm": "7A"
        }
        
        if best_mode == "major":
            musical_key = best_key
            camelot_key = major_camelot.get(best_key, "8B")
        else:
            musical_key = f"{best_key}m"
            camelot_key = minor_camelot.get(musical_key, "8A")
            
        return musical_key, camelot_key
    except Exception as e:
        print(f"[KEY DETECTION ERROR] {e}")
        return "C", "8B"

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "audio_libs": {
            "librosa": "available",
            "numpy": "available",
            "ffmpeg": "available" if os.system("ffmpeg -version >nul 2>&1" if os.name == "nt" else "ffmpeg -version >/dev/null 2>&1") == 0 else "unavailable"
        }
    }

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_track(request: AnalysisRequest):
    """
    Downloads track from Vercel Blob URL, performs librosa analysis, and outputs parameters.
    """
    if not request.blob_url:
        raise HTTPException(status_code=400, detail="blob_url cannot be empty")
    
    # Generate a temporary file with the proper extension
    parsed_url = urlparse(request.blob_url)
    ext = os.path.splitext(parsed_url.path)[1] or ".mp3"
    
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as temp_file:
        temp_path = temp_file.name
        
    try:
        # Download the file content securely via HTTP
        async with httpx.AsyncClient() as client:
            response = await client.get(request.blob_url, follow_redirects=True)
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Failed to fetch file from Blob URL, status: {response.status_code}")
            temp_file_write = open(temp_path, "wb")
            temp_file_write.write(response.content)
            temp_file_write.close()
            
        # Load the audio file
        y, sr = librosa.load(temp_path, sr=None)
        duration_seconds = float(librosa.get_duration(y=y, sr=sr))
        
        # 1. BPM / Tempo analysis
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempos, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
        bpm = float(tempos[0]) if hasattr(tempos, "__len__") else float(tempos)
        bpm = round(bpm, 1)
        
        # Fallback if BPM is out of sensible range
        if bpm < 30 or bpm > 250:
            bpm = 120.0
            
        # 2. Musical Key detection
        musical_key, camelot_key = estimate_key(y, sr)
        
        # 3. Overall energy level (RMS energy)
        rms = librosa.feature.rms(y=y)[0]
        mean_rms = float(np.mean(rms))
        energy = float(np.clip(mean_rms / 0.25, 0.05, 1.0))
        
        # 4. Frequencies distribution (Lows, Mids, Highs)
        stft = np.abs(librosa.stft(y))
        frequencies = librosa.fft_frequencies(sr=sr)
        
        low_mask = (frequencies >= 20) & (frequencies < 250)
        mid_mask = (frequencies >= 250) & (frequencies < 4000)
        high_mask = (frequencies >= 4000) & (frequencies <= 20000)
        
        low_val = float(np.mean(stft[low_mask, :])) if np.any(low_mask) else 0.0
        mid_val = float(np.mean(stft[mid_mask, :])) if np.any(mid_mask) else 0.0
        high_val = float(np.mean(stft[high_mask, :])) if np.any(high_mask) else 0.0
        
        total_freqs = low_val + mid_val + high_val
        if total_freqs > 0:
            lows = round(low_val / total_freqs, 2)
            mids = round(mid_val / total_freqs, 2)
            highs = round(high_val / total_freqs, 2)
        else:
            lows, mids, highs = 0.33, 0.33, 0.33
            
        # Normalize sum of bands to 1.0
        sum_bands = lows + mids + highs
        if sum_bands > 0:
            lows = round(lows / sum_bands, 2)
            mids = round(mids / sum_bands, 2)
            highs = round(1.0 - lows - mids, 2) # ensure perfect sum to 1.0
            
        # 5. Downsampled waveform envelope (100 points)
        chunk_size = len(y) // 100
        waveform = []
        if chunk_size > 0:
            for i in range(100):
                chunk = y[i * chunk_size : (i + 1) * chunk_size]
                rms_val = np.sqrt(np.mean(chunk**2))
                waveform.append(float(rms_val))
            max_wave = max(waveform) if waveform else 0
            if max_wave > 0:
                waveform = [round(w / max_wave, 4) for w in waveform]
            else:
                waveform = [0.5] * 100
        else:
            waveform = [0.5] * 100
            
        return AnalysisResponse(
            track_id=request.track_id,
            bpm=bpm,
            musical_key=musical_key,
            camelot_key=camelot_key,
            energy=round(energy, 2),
            lows=lows,
            mids=mids,
            highs=highs,
            waveform=waveform,
            duration_seconds=round(duration_seconds, 2)
        )
    except Exception as e:
        print(f"[ANALYSIS SERVICE RUNTIME ERROR] {e}")
        raise HTTPException(status_code=500, detail=f"Audio analysis failed: {str(e)}")
    finally:
        # Local cleanup
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                print(f"[CLEANUP ERROR] Failed to delete temp file {temp_path}: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
