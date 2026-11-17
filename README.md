# 🕹️ Spaceship IDE

Steer your ideas in realtime, space pilot style!

This repo is maintained independently by FlyingGorillaz. It started from [Spaceship IDE](https://github.com/chuanqisun/spaceship) by Chuanqi Sun; see the citation below and `LICENSE`.

![Screencast](./extra/screencast.gif)

## Demos

Watch on [Instagram](https://www.instagram.com/reels/DfyQPhFtW-z/) and [YouTube](https://www.youtube.com/watch?v=3WmNLWUmcnY). You can try the simulator at [https://flyinggorillaz.github.io/spaceshipUI/](https://flyinggorillaz.github.io/spaceshipUI/) with the option to go live with your API keys for Cerebras and Gemini. Keys stay in your browser local storage. Do it at your own risk.

## Conjecture

> In the near future, LLM and Decision Models will reach 60 FPS interactivity.

When that happens, what new interaction paradigms will unlock? This project demonstrates plausible and desirable interactions for that future.

1. **Focus monitor**: can we visualize what LLM is paying attention to, and use that to guide human's focus towards what's important?

   ![focus monitor](./extra/clips/focus-monitor.gif)

2. **Attention lock**: can we force LLM to pay more attention to specific phrases so as to bias its future behavior?

   ![attention lock](./extra/clips/attention-lock.gif)

3. **Future Vector Steering**: can we decompose the task into eigenvectors, independently tune each, and re-compose them to influence the incoming text?

   ![future steering](./extra/clips/future-steering.gif)

4. **Realtime re-generation**: when text generation is cheap and fast, can we explore alternative futures by scrubbing?

   ![realtime regeneration](./extra/clips/realtime-regeneration.gif)

## Design process

I used Claude Code for most of the implementation but stayed hands-on for the UI/UX. I iterate using interactive style swatch, a technique where I prompt AI to give me diverse options of designs, I provide feedback, and it iterates. You can see the design artifacts in the [extra page](https://chuanqisun.github.io/spaceship/extra/style-1.html).

To achieve the realtime experience, I have to use agreesive speculative generation and manage cache invalidation based on user interactions. For example, when the main knob moves backward, I have to empty future texts and cancel ongoing requests. There are many considerations like this throughout the system and that took a lot of human judgement - claude didn't one shot them.

## Theory

I'm currently focusing on systems that help human shape ideas in realtime. This project is a small step towards my [upcoming thesis](https://code.chuanqisun.com/master-thesis/) at the MIT Media Lab, where I investigate how semantic and symoblic systems can be coupled to enhance human creativity, agency, and joy of craft.

## Playing the instrument

The page teaches itself: text auto-reveals on load, a hint names the first gesture, and an idle attract shows the scrub. Press `h` or `?` (or the tray `?` button) for the full gesture legend. Upcoming words wait as faint ghost text past the caret, and a hairline marks the press-pull steering zone.

Scrubbing back never loses text — a `↩ restore` chip in the tray brings the discarded continuation back for ten seconds. Turn a selection into an attention box with `⌥`-drag; a plain selection still copies. Arrow keys nudge the knob a word at a time and `Enter` expands attention. Caret position, boxes, and knob settings persist across reloads, the sound preference is remembered, `prefers-reduced-motion` is respected, and touch input works without the cursor layer — on phones the layout reflows, the tray reserves its wrapped height, knobs grow to fingertip size, a tap expands attention, a hold spawns or deletes future knobs, side buttons cover keyboard nudges and box commits, rail-only model scoring pauses where the rail is hidden, and vertical pans still scroll. See [docs/user-guide.md](./docs/user-guide.md) for the full reference.

## Development

```sh
npm ci
npm run dev
```

Run `npm run check` before you push: format check, type check, unit tests, the end-to-end UX suite, build and bundle secret check. The UX suite (`npm run test:e2e`) drives the simulator in headless Chromium; install it once with `npx playwright-core install chromium`, or point `CHROMIUM` at a local Chrome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow, the [constitution](./.specify/memory/constitution.md) for project standards, and [SECURITY.md](./SECURITY.md) for how API keys are handled.

## Citation

If you build on this work, please cite it as:

```bibtex
@misc{sun2026spaceship,
  author       = {Sun, Chuanqi},
  title        = {Spaceship {IDE}: Steer Your Ideas in Realtime, Space Pilot Style},
  year         = {2026},
  publisher    = {GitHub},
  howpublished = {\url{https://github.com/chuanqisun/spaceship}},
  note         = {Demo: \url{https://chuanqisun.github.io/spaceship/}}
}
```
