const dropzone = document.getElementById('dropzone');
const dropzoneLabel = document.getElementById('dropzone-label');
const statusText = document.getElementById('status-text');
const progressFill = document.getElementById('progress-fill');
const outputPath = document.getElementById('output-path');

const VALID_EXT = ['.mp3', '.m4a', '.wav'];

function setBusy(busy) {
  dropzone.classList.toggle('busy', busy);
}

function setProgress(pct) {
  progressFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function setStatus(text) {
  statusText.textContent = text;
}

['dragenter', 'dragover'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!VALID_EXT.includes(ext)) {
    setStatus(`Unsupported file type: ${ext}`);
    return;
  }

  outputPath.textContent = '';
  setProgress(0);
  setBusy(true);
  setStatus('Converting audio…');
  dropzoneLabel.textContent = file.name;

  try {
    await window.momentum.transcribeFile(file.path);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    setBusy(false);
  }
});

window.momentum.onProgress((line) => {
  if (line.startsWith('DURATION')) {
    setStatus('Converting audio…');
    setProgress(2);
  } else if (line.startsWith('CHUNK')) {
    const [, frac] = line.split(' ');
    const [x, y] = frac.split('/').map(Number);
    setStatus(`Transcribing chunk ${x} of ${y}`);
    setProgress(5 + (x / y) * 75);
  } else if (line.startsWith('SPEAKERS_START') || line.startsWith('SPEAKERS_FALLBACK')) {
    setStatus('Detecting speakers…');
    setProgress(85);
  } else if (line.startsWith('WRITING_OUTPUTS')) {
    setStatus('Writing outputs…');
    setProgress(95);
  } else if (line.startsWith('DONE')) {
    const folder = line.slice('DONE '.length).trim();
    setStatus('Done');
    setProgress(100);
    outputPath.textContent = folder;
    outputPath.onclick = () => window.momentum.revealInFinder(folder);
    setBusy(false);
  }
});
