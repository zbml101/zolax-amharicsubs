# Amharic Subtitles (ንዑስ ጽሑፍ)

React + Vite app. Supabase = auth, database, transcription Edge Function. GitHub = code. Cloudflare Pages = hosting, DNS, domain.

## 1. Supabase
1. Create a project. In **SQL Editor**, run `supabase/schema.sql`.
2. Google Cloud (speech model): create a project, enable **Cloud Speech-to-Text API**, create a service account with role **Cloud Speech Client**, and download its JSON key.
3. Install the Supabase CLI, then:
   ```
   supabase login && supabase link --project-ref YOUR_REF
   supabase secrets set GOOGLE_SA_JSON="$(cat key.json)" GOOGLE_REGION=asia-southeast1
   supabase functions deploy transcribe
   ```
4. **Authentication > URL Configuration**: set Site URL to `https://yourdomain.com` and add `http://localhost:5173` to Redirect URLs.

## 2. Run locally
```
cp .env.example .env   # fill in URL + anon key (Settings > API)
npm install && npm run dev
```

## 3. GitHub
```
git init && git add . && git commit -m "Initial commit"
git remote add origin git@github.com:YOU/amharic-subs.git && git push -u origin main
```

## 4. Cloudflare Pages + domain
1. Cloudflare dashboard > **Workers & Pages > Create > Pages > Connect to Git**, pick the repo.
2. Build command `npm run build`, output directory `dist`.
3. Add env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. After the first deploy: **Custom domains > Set up a domain**. If the domain's DNS is on Cloudflare, the records are created for you.

## Notes
- Transcription uses Google Speech-to-Text v2, model `chirp_2`, `am-ET`, with word timestamps grouped into subtitle lines. Edit `supabase/functions/transcribe/index.ts` to change the engine.
- If you created the table with the first version, run `supabase/migrations/add_style.sql`.
- Downloads: SRT (top/middle/bottom only), VTT and ASS (exact position), Text.
- Audio is decoded in the browser and sent in ~50-second chunks cut at pauses. Media files are not uploaded to storage.
- Fonts: Noto Sans Ethiopic (interface) and Noto Serif Ethiopic (subtitle text).
