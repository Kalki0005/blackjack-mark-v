# Dealer & Background Art — generate with ChatGPT Pro / Gemini Pro

No Higgsfield credits needed: generate these in ChatGPT (best — supports
transparent-background PNG) or Gemini, drop the files into
`frontend/public/art/`, and Claude wires them into the game (blue theme ↔ male
dealer, green theme ↔ female dealer).

**Tips**
- ChatGPT: say "PNG with a fully transparent background" — its image tool can do
  real transparency. Gemini can't reliably; ask Gemini for a **plain solid
  chroma-green (#00FF00) background** instead and Claude will key it out.
- Generate the IDLE image first. Then, in the SAME chat, ask for edits of the
  same character for other poses so the face/outfit stay consistent.
- Portrait ratio (2:3 or 3:4), at least 1024×1536. Waist-up framing.

---

## 1) Male dealer — BLUE theme  → save as `art/dealer_male_idle.png`

> Photorealistic portrait of a professional casino dealer, a fit and handsome
> man around 30 with well-groomed short hair, wearing an elegant fitted BLACK
> dealer's jacket over a black shirt, standing behind a blackjack table (table
> NOT visible in frame). Framed from the waist up, facing the camera directly,
> seen from slightly above (camera ~20 degrees looking down). Both forearms
> resting relaxed in front as if on a table edge, hands loosely together.
> Neutral, calm, faintly friendly expression. Soft even studio lighting like a
> live-casino stream. PNG with fully transparent background.

Then in the same chat, request these edits (same character, same framing, same light):
- `art/dealer_male_deal.png` — "same dealer, right hand extended forward-down as if sliding a playing card across a table"
- `art/dealer_male_shuffle.png` — "same dealer, both hands together in front shuffling a deck of cards"
- `art/dealer_male_smile.png` — "same dealer, subtle pleased smile, giving a small congratulatory nod"

## 2) Female dealer — GREEN theme  → save as `art/dealer_female_idle.png`

> Photorealistic portrait of a professional casino dealer, a beautiful fit
> woman around 27 with long flowing hair and an elegant GOLDEN evening dress
> with a tasteful neckline, standing behind a blackjack table (table NOT
> visible in frame). Framed from the waist up, facing the camera directly, seen
> from slightly above (camera ~20 degrees looking down). Both forearms resting
> relaxed in front as if on a table edge. Neutral, composed, faintly warm
> expression. Soft even studio lighting like a live-casino stream. PNG with
> fully transparent background.

Same-chat edits: `dealer_female_deal.png`, `dealer_female_shuffle.png`,
`dealer_female_smile.png` (same wording as the male ones).

## 3) Background — BLUE theme  → save as `art/bg_blue.jpg`

> Wide 16:9 background of a premium live-casino studio: dark navy-blue padded
> wall panels with warm golden vertical wood slats on both sides, a large round
> glowing dark-blue circle with a thin gold rim centered in the back wall,
> subtle warm spotlights, shallow depth of field. NO people, NO table, NO
> furniture in the lower half — the bottom third stays clean and dark. Style of
> an Evolution Gaming / Stake live blackjack studio. 16:9, at least 1920×1080.

## 4) Background — GREEN theme  → save as `art/bg_green.jpg`

> Wide 16:9 background of a luxurious private casino salon: deep emerald-green
> tufted leather wall panels, dark wood and brass details, warm golden accent
> lighting, soft bokeh highlights, elegant curtains at the edges. NO people, NO
> table, NO furniture in the lower half — the bottom third stays clean and
> dark. Premium, classy, cinematic. 16:9, at least 1920×1080.

---

**Drop files here:** `Blackjack/Mark V/frontend/public/art/`
Then tell Claude "art is in" — integration (layering behind the table, theme
pairing, pose-swap animations keyed to game events, blink/idle motion via
subtle CSS) is already planned and needs no further art.
