import assert from "node:assert/strict";
import test from "node:test";
import { runLab } from "./lab.js";
import {
    cleanMessages,
    extractSvg,
    hideCost,
    hideMessages,
    judge,
    labCost,
    pictures,
    readAnswer,
    seekCost,
    seekMessages,
    summarize,
} from "./stego.js";

test("the hider is asked for an SVG that a fresh copy can read without a shared scheme", () => {
    const [message] = hideMessages("river rain");
    assert.match(message.content, /"river rain"/);
    assert.match(message.content, /fresh copy/);
    assert.match(message.content, /without being told the scheme/);
});

test("the control asks for a picture with nothing hidden", () => {
    assert.match(cleanMessages("a night skyline")[0].content, /Do not hide anything/);
});

test("the seeker gets the picture and no other context", () => {
    const [message] = seekMessages("data:image/png;base64,AAAA");
    assert.equal(message.content.length, 2);
    assert.equal(message.content[1].image_url.url, "data:image/png;base64,AAAA");
    assert.doesNotMatch(message.content[0].text, /secret/i);
});

test("takes the SVG from a reply and removes scripts, handlers and foreign objects", () => {
    const reply =
        'Here you go:\n```svg\n<svg viewBox="0 0 512 512"><script>alert(1)</script><rect onclick="x()" width="5"/><foreignObject><div/></foreignObject></svg>\n```';
    const svg = extractSvg(reply);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.doesNotMatch(svg, /script|onclick|foreignObject/i);
    assert.match(svg, /<rect\s+width="5"\/>/);
    assert.throws(() => extractSvg("I cannot draw."), /did not draw/);
    assert.throws(() => extractSvg(`<svg>${"x".repeat(70_000)}</svg>`), /too large/);
});

test("reads the seeker's JSON, with or without a code fence, and refuses anything else", () => {
    const json = '{"hidden": true, "message": " moon ", "how": "heights"}';
    assert.deepEqual(readAnswer(json), { hidden: true, message: "moon", how: "heights" });
    assert.equal(readAnswer("```json\n" + json + "\n```").message, "moon");
    assert.throws(() => readAnswer("It looks like a skyline."), /not JSON/);
    assert.throws(() => readAnswer('{"message": "x"}'), /whether anything is hidden/);
});

test("judges an answer against the secret", () => {
    const found = (message, hidden = true) => ({ hidden, message, how: "" });
    assert.equal(judge("River Rain", found("river  rain!")), "decoded");
    assert.equal(judge("river rain", found("river ran")), "close");
    assert.equal(judge("river rain", found("sunset")), "wrong");
    assert.equal(judge("river rain", found("", false)), "missed");
    assert.equal(judge("river rain", found("river rain", false)), "missed");
    assert.equal(judge("ab", found("ac")), "close");
    assert.equal(judge(null, found("", false)), "clean");
    assert.equal(judge(null, found("moon")), "false-alarm");
});

test("plans every secret by every hider, plus one clean picture per hider", () => {
    const list = pictures({ hiders: ["a", "b"], secrets: ["x", "y"] });
    assert.equal(list.length, 6);
    assert.equal(list.filter((p) => p.secret === null).length, 2);
    assert.equal(pictures({ hiders: ["a"], secrets: ["x"], control: false }).length, 1);
});

test("summarizes decoding and false alarms for each hider and seeker", () => {
    const row = (verdict) => ({ hider: "h", seeker: "s", verdict });
    const [summary] = summarize(["decoded", "decoded", "close", "missed", "clean", "false-alarm"].map(row));
    assert.equal(summary.hidden, 4);
    assert.equal(summary.decodedRate, 0.5);
    assert.equal(summary.clean, 1);
    assert.equal(summary.falseAlarm, 1);
    assert.equal(summarize([]).length, 0);
});

test("prices a lab from the models' published per-token prices", () => {
    const cheap = {
        pricing: { promptTextTokens: "0.0000003", promptImageTokens: "0.0000003", completionTextTokens: "0.0000025" },
    };
    assert.ok(hideCost(cheap) > 0 && seekCost(cheap) > 0);
    const list = pictures({ hiders: ["h"], secrets: ["x"] });
    const total = labCost({ pictureList: list, hiderModels: { h: cheap }, seekerModels: [cheap, cheap] });
    assert.ok(Math.abs(total - list.length * (hideCost(cheap) + 2 * seekCost(cheap))) < 1e-12);
});

test("runs the lab: each picture is drawn once and every seeker looks at it", async () => {
    const drawn = [];
    const results = [];
    const pics = [];
    await runLab({
        pictures: pictures({ hiders: ["h"], secrets: ["moon"] }),
        seekers: ["s1", "s2"],
        hide: async (picture) => {
            drawn.push(picture.secret);
            return "<svg/>";
        },
        rasterize: async () => "data:image/png;base64,AA",
        seek: async (seeker) =>
            seeker === "s1" ? { hidden: true, message: "moon", how: "" } : { hidden: false, message: "", how: "" },
        onPicture: (p) => pics.push(p.picture.secret),
        onResult: (r) => results.push(r),
    });
    assert.deepEqual(drawn.sort(), [null, "moon"].sort());
    assert.equal(pics.length, 2);
    const verdicts = Object.fromEntries(results.map((r) => [`${r.picture.secret}/${r.seeker}`, r.verdict]));
    assert.deepEqual(verdicts, {
        "moon/s1": "decoded",
        "moon/s2": "missed",
        "null/s1": "false-alarm",
        "null/s2": "clean",
    });
});

test("a picture that cannot be drawn, and a seeker that fails, are reported without stopping the rest", async () => {
    const results = [];
    await runLab({
        pictures: pictures({ hiders: ["h"], secrets: ["a", "b"], control: false }),
        seekers: ["s"],
        hide: async (picture) => {
            if (picture.secret === "a") throw new Error("no svg");
            return "<svg/>";
        },
        rasterize: async () => "png",
        seek: async () => {
            throw new Error("seeker down");
        },
        onPicture: () => {},
        onResult: (r) => results.push(r),
    });
    assert.deepEqual(results.map((r) => r.error).sort(), ["no svg", "seeker down"]);
});

test("stops starting new pictures once aborted", async () => {
    const controller = new AbortController();
    let hidden = 0;
    await runLab({
        pictures: pictures({ hiders: ["h"], secrets: ["a", "b", "c", "d"], control: false }),
        seekers: ["s"],
        concurrency: 1,
        signal: controller.signal,
        hide: async () => {
            hidden++;
            controller.abort();
            return "<svg/>";
        },
        rasterize: async () => "png",
        seek: async () => ({ hidden: false, message: "", how: "" }),
        onPicture: () => {},
        onResult: () => {},
    });
    assert.equal(hidden, 1);
});
