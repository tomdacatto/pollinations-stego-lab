# Stego Lab

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

**Live:** https://tomdacatto.github.io/pollinations-stego-lab/

Pollinations quest [#18367](https://github.com/pollinations/pollinations/issues/18367): an app about messages hidden in images, built on Pollinations LLMs, paid with the visitor's own Pollen.

The post [How does Fable 5.1 hide messages in images?](https://www.lesswrong.com/posts/WHEQps5PK8LrrcTAb/how-does-fable-5-1-hide-messages-in-images) asked a model to hide a secret in a picture it drew as SVG code, then showed only the picture to a fresh session and asked whether anything was hidden. This app runs that experiment on any Pollinations models and keeps score.

## The experiment

1. A **hider** model draws an SVG (viewBox 512) with a secret in it. It is told a fresh copy of itself will see only a PNG and must work the secret out with no agreed scheme.
2. The SVG is rendered to a PNG in the browser. The PNG is the only thing a **seeker** model sees: no code, no secret, no hint of how it was made.
3. The seeker answers with JSON: whether anything is hidden, the message, and how it was encoded.
4. The answer is judged in code, not by a model: **decoded** (same letters and digits, ignoring case and spacing), **close** (within a fifth of the letters), **wrong**, or **missed**.
5. Each hider also draws one picture with nothing hidden. A seeker that claims a message there has raised a **false alarm**. Decoding rates mean little without it.

Pick several hiders and several seekers and every picture is drawn once and shown to every seeker, so pairs are compared on the same pictures. The summary table gives, per pair, decoded, close, wrong and missed out of the pictures with a secret, and false alarms out of the clean ones. Each picture shows what each seeker said it found and how, and its SVG source. "Hide the secrets" lets you guess from the picture before the results are revealed.

## How it pays

There is no server and no key in this repository. The visitor signs in on enter.pollinations.ai ([Bring Your Own Pollen](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md), fragment flow); the key comes back in the URL fragment, is removed from the address bar and is kept in `sessionStorage` for that tab only. The sign-in asks for a 0.5 Pollen budget and one day. Models and their prices come live from `gen.pollinations.ai/text/models`, and the page shows a rough price for the lab before it runs. Seekers are limited to models that accept images. Claude models are paid-only.

## Safety of the pictures

Model-written SVG is data. Scripts, event handlers and `foreignObject` are stripped from it, and it is only ever shown through an `<img>`, which does not run scripts.

## Files

- `stego.js`: the prompts, taking the SVG from a reply, reading a seeker's answer, judging, planning, the summary and price estimate (no network, no DOM)
- `lab.js`: runs the experiment with the model calls and the renderer passed in
- `raster.js`: SVG to PNG; `models.js`: the live model list; `pollen.js`: sign-in and the chat call
- `app.js`, `index.html`, `style.css`: the page
- `config.js`: budget, expiry, concurrency and the starting models and secrets

## Run and test

```bash
python -m http.server 8791   # any static server works
npm test                     # node --test, no dependencies
```

MIT licensed.
