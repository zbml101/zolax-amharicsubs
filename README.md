# Amharic Subtitles (ንዑስ ጽሑፍ)

React + Vite web app. Supabase = login + database. GitHub = code. Cloudflare Pages = hosting, DNS, domain.
Speech recognition = a free, self-hosted Amharic model (`asr-server/`). No paid services.

## 1. Supabase (free plan)
1. Create a project. In **SQL Editor**, run `supabase/schema.sql`. (Older install? Run `supabase/migrations/add_style.sql` instead.)
2. **Authentication > URL Configuration**: Site URL = `https://yourdomain.com`; add `http://localhost:5173` to Redirect URLs.

## 2. The Amharic speech server (free GPU)
Uses the open model `snapwre/hohe-asr-amharic` (CC BY 4.0, trained on 880 hours of Amharic, with a 5-gram language model) plus Silero VAD for subtitle timing. Credit: Chapi and the Dataset.ET contributors.
1. Open Google Colab, upload `asr-server/amharic_asr_colab.ipynb`, set **Runtime > T4 GPU**, run all cells.
2. Copy the `https://….trycloudflare.com` address it prints.
3. In the web app, paste it under "Transcription server" and click **Test connection**.
Colab sessions end after a while: rerun the notebook and paste the new address. Kaggle notebooks (free GPU) or any PC/server with a GPU can run `asr-server/server.py` the same way (`pip install -r asr-server/requirements.txt && uvicorn server:app --port 8000`).
Set a password with `ASR_TOKEN` if you do not want strangers using your server. Without a GPU it is slower but can work for short clips. To try another model, set `MODEL_ID` (it must be a CTC model with the same file layout).

## 3. Run locally
```
cp .env.example .env   # Supabase URL + anon key (Settings > API)
npm install && npm run dev
```

## 4. GitHub
```
git init && git add . && git commit -m "Initial commit"
git remote add origin git@github.com:YOU/amharic-subs.git && git push -u origin main
```

## 5. Cloudflare Pages + domain
1. Workers & Pages > Create > Pages > Connect to Git, pick the repo.
2. Build command `npm run build`, output directory `dist`.
3. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (optionally `VITE_ASR_URL`).
4. Custom domains > Set up a domain. If DNS is already on Cloudflare, records are created for you.

## Notes
- Video size: convert to 9:16, 16:9, 1:1 or 4:5 (crop to fill with an adjustable crop position, or fit over a blurred background). Subtitle size and position adapt to the chosen shape, in the preview, the exported video and the ASS file.
- Editor: karaoke word colours, font/colour/position controls, split and merge lines, find and replace, autosave, and project delete.
- "Create video" records the preview in the browser (real time) and downloads an MP4 or WebM with the subtitles burned in. No server needed.
- Downloads: SRT (top/middle/bottom only), VTT and ASS (exact position), Text.
- Media files stay on the user's device; only subtitles and positions are saved.
- Variables starting with `VITE_` are public in the built site. Do not treat `VITE_ASR_TOKEN` as a secret.
