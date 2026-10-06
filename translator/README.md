# Voice Translator

A browser-based translator for 130+ languages with a microphone for speaking instead of typing.

## Features
- Translate between 133 languages, with automatic source-language detection
- 🎤 Speak into the mic and your speech is typed and translated live
- 🔊 Hear the original or the translation read aloud
- ⇄ Swap languages, 📋 copy the translation
- Remembers your last chosen languages; works on phone and desktop, light and dark mode

## How to use
Open `index.html` in a browser. No installation or API key is needed, but an internet connection is.

The mic uses the browser's Web Speech API, which works in **Chrome, Edge and Safari** (not Firefox).
The browser will ask for microphone permission the first time. Speech recognition needs the page
to be served over `https://` or opened as a local file — for example via GitHub Pages.

Speech input and read-aloud availability for a given language depends on what your browser/OS supports;
text translation works for every language in the list.
