import { CONCURRENCY, DEFAULT_HIDER, DEFAULT_SECRETS, DEFAULT_SEEKER } from "./config.js";
import { runLab } from "./lab.js";
import { loadModels } from "./models.js";
import { chat, clearSession, completeSignIn, getSession, startSignIn } from "./pollen.js";
import { rasterize } from "./raster.js";
import {
    cleanMessages,
    extractSvg,
    hideMessages,
    labCost,
    pictures,
    readAnswer,
    scenes,
    seekMessages,
    summarize,
} from "./stego.js";

const $ = (selector) => document.querySelector(selector);
const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

const state = { models: [], results: [], cards: new Map(), revealed: new Set(), controller: null };
const byName = () => Object.fromEntries(state.models.map((model) => [model.name, model]));
const money = (pollen) => (pollen < 0.001 ? "under 0.001" : pollen.toFixed(3));

function notice(message, kind = "info") {
    const box = $("#notice");
    box.hidden = !message;
    box.className = `notice ${kind === "error" ? "error" : ""}`;
    box.textContent = message ?? "";
}

function renderSession() {
    const session = getSession();
    $("#whoami").hidden = !session;
    $("#sign-out").hidden = !session;
    $("#sign-in").hidden = Boolean(session);
}

// Model pickers.
function renderPickers() {
    for (const [id, onlyVision, preset] of [
        ["#hiders", false, DEFAULT_HIDER],
        ["#seekers", true, DEFAULT_SEEKER],
    ]) {
        const box = $(id);
        box.replaceChildren();
        const shown = state.models.filter((m) => m.vision || !onlyVision);
        // The default model first, then the rest from cheapest.
        shown.sort((a, b) => (b.name === preset) - (a.name === preset));
        for (const model of shown) {
            const label = el("label");
            const input = Object.assign(document.createElement("input"), {
                type: "checkbox",
                value: model.name,
                checked: model.name === preset,
                onchange: renderEstimate,
            });
            const price = el(
                "span",
                "price",
                `$${(Number(model.pricing.completionTextTokens) * 1e6).toFixed(2)}/M out${model.paidOnly ? " · paid" : ""}`,
            );
            label.append(input, el("span", "", model.name), price);
            box.append(label);
        }
    }
}

const checked = (id) => [...document.querySelectorAll(`${id} input:checked`)].map((input) => input.value);
const secrets = () =>
    $("#secrets")
        .value.split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 8);

function plan() {
    const hiders = checked("#hiders");
    const seekers = checked("#seekers");
    const list = pictures({ hiders, secrets: secrets(), control: $("#control").checked });
    return { hiders, seekers, list };
}

function renderEstimate() {
    const { hiders, seekers, list } = plan();
    const models = byName();
    if (!list.length || !seekers.length) {
        $("#estimate").textContent = "Pick at least one hider, one seeker and one secret.";
        return;
    }
    const cost = labCost({
        pictureList: list,
        hiderModels: Object.fromEntries(hiders.map((name) => [name, models[name]])),
        seekerModels: seekers.map((name) => models[name]),
    });
    $("#estimate").textContent =
        `${list.length} pictures, each looked at by ${seekers.length} seeker${seekers.length > 1 ? "s" : ""}: about ${money(cost)} Pollen (a rough estimate).`;
}

// Results.
function renderSummary() {
    const rows = summarize(state.results);
    $("#summary").hidden = !rows.length;
    const table = $("#table");
    table.replaceChildren();
    const head = el("tr");
    for (const title of ["Hider", "Seeker", "Decoded", "Close", "Wrong", "Missed", "False alarms"])
        head.append(el("th", "", title));
    table.append(head);
    for (const row of rows) {
        const tr = el("tr");
        const rate = row.decodedRate === null ? "" : ` (${Math.round(row.decodedRate * 100)}%)`;
        const cells = [
            row.hider,
            row.seeker,
            `${row.decoded} of ${row.hidden}${rate}`,
            row.close,
            row.wrong,
            row.missed,
            row.clean + row.falseAlarm ? `${row.falseAlarm} of ${row.clean + row.falseAlarm}` : "no control",
        ];
        for (const cell of cells) tr.append(el("td", "", String(cell)));
        table.append(tr);
    }
}

function card(picture, svg, png) {
    const key = `${picture.hider}\n${picture.secret}`;
    const node = el("article", "pic");
    const image = Object.assign(document.createElement("img"), {
        src: png,
        alt: "A picture drawn by a model, possibly with a hidden message",
    });
    const title = el("h3");
    const meta = el("div", "meta");
    const answers = el("div");
    const reveal = Object.assign(el("button", "button", "Reveal"), { type: "button" });
    const source = el("details");
    const summary = el("summary", "", "SVG source");
    const area = Object.assign(document.createElement("textarea"), { readOnly: true, value: svg });
    source.append(summary, area);
    node.append(image, title, meta, reveal, answers, source);
    state.cards.set(picture, { node, title, meta, answers, reveal, key });
    $("#gallery").append(node);
    paintCard(picture);
    reveal.onclick = () => {
        state.revealed.add(picture);
        paintCard(picture);
    };
}

function paintCard(picture) {
    const parts = state.cards.get(picture);
    if (!parts) return;
    const blind = $("#blind").checked && !state.revealed.has(picture);
    const kind =
        picture.secret === null ? "Nothing hidden" : blind ? "A secret is hidden" : `Secret: ${picture.secret}`;
    parts.title.textContent = kind;
    parts.meta.textContent = `drawn by ${picture.hider}`;
    parts.reveal.hidden = !blind;
    parts.answers.replaceChildren();
    for (const result of state.results.filter((r) => r.picture === picture)) {
        const box = el("div", `seek v-${result.error ? "error" : result.verdict}`);
        const head = el("div");
        head.append(el("strong", "", result.seeker), " ", el("span", "badge", result.error ? "error" : result.verdict));
        box.append(head);
        if (result.error) box.append(el("div", "how", result.error));
        else if (!blind) {
            box.append(el("div", "", result.answer.hidden ? `Found: "${result.answer.message}"` : "Found nothing"));
            if (result.answer.how) box.append(el("div", "how", result.answer.how));
        } else box.append(el("div", "how", "Hidden until you reveal"));
        parts.answers.append(box);
    }
}

// Running the lab.
async function run() {
    if (!getSession()) return startSignIn();
    const { seekers, list } = plan();
    if (!list.length || !seekers.length) return notice("Pick at least one hider, one seeker and one secret.", "error");
    state.results = [];
    state.cards.clear();
    state.revealed.clear();
    $("#gallery").replaceChildren();
    notice(null);
    state.controller = new AbortController();
    const { signal } = state.controller;
    $("#run").disabled = true;
    $("#stop").hidden = false;
    let done = 0;
    const total = list.length * seekers.length;
    const progress = () => ($("#progress").textContent = `${done} of ${total} looks done`);
    progress();
    try {
        await runLab({
            pictures: list,
            seekers,
            concurrency: CONCURRENCY,
            signal,
            hide: async (picture) =>
                extractSvg(
                    await chat(
                        picture.hider,
                        picture.secret === null
                            ? cleanMessages(picture.scene ?? scenes[0])
                            : hideMessages(picture.secret),
                        { signal },
                    ),
                ),
            rasterize,
            seek: async (seeker, png) => readAnswer(await chat(seeker, seekMessages(png), { signal })),
            onPicture: ({ picture, svg, png }) => card(picture, svg, png),
            onResult: (result) => {
                state.results.push(result);
                done++;
                progress();
                renderSummary();
                paintCard(result.picture);
                if (result.error && /sign-in expired|Out of Pollen/.test(result.error)) state.controller.abort();
            },
        });
    } catch (error) {
        notice(error.message, "error");
    } finally {
        $("#run").disabled = false;
        $("#stop").hidden = true;
        const firstError = state.results.find((r) => r.error)?.error;
        if (firstError) notice(`Some looks failed. The first error: ${firstError}`, "error");
        renderSession();
    }
}

// Start.
$("#sign-in").onclick = () => startSignIn();
$("#sign-out").onclick = () => {
    clearSession();
    renderSession();
};
$("#run").onclick = run;
$("#stop").onclick = () => state.controller?.abort();
$("#blind").onchange = () => {
    for (const picture of state.cards.keys()) paintCard(picture);
};
$("#control").onchange = renderEstimate;
$("#secrets").oninput = renderEstimate;
$("#secrets").value = DEFAULT_SECRETS.join("\n");

const outcome = completeSignIn();
if (outcome && outcome !== "ok")
    notice(
        {
            denied: "Sign-in was cancelled.",
            "bad-state": "That sign-in did not match this page. Try again.",
            "bad-key": "The sign-in returned something unexpected. Try again.",
            "no-storage": "This browser blocks the storage the sign-in needs.",
        }[outcome],
        "error",
    );
renderSession();
loadModels()
    .then((models) => {
        state.models = models;
        renderPickers();
        renderEstimate();
    })
    .catch((error) => notice(`Could not load the model list: ${error.message}`, "error"));
