const publicationSources = [
    { path: "./publication/journal.bib", category: "journal", label: "Journal" },
    { path: "./publication/conference.bib", category: "conference", label: "International" },
    { path: "./publication/symposium.bib", category: "symposium", label: "Symposium" },
    { path: "./publication/domestic.bib", category: "domestic", label: "Domestic" },
    { path: "./publication/patent.bib", category: "patent", label: "Patent" }
];

const categoryRank = {
    journal: 0,
    conference: 1,
    symposium: 2,
    domestic: 3,
    patent: 4
};

const selectedKeys = [
    "ueda2026vhf",
    "yamaguchi2026efficient",
    "lu2026analyzing",
    "yamaguchi2024experience"
];

let publications = [];
let activeFilter = "all";

function escapeHtml(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function normalizeBibValue(value = "") {
    let output = value.trim();
    while (output.startsWith("{") && output.endsWith("}")) {
        output = output.slice(1, -1).trim();
    }

    return output
        .replaceAll("\\&", "&")
        .replaceAll("\\_", "_")
        .replaceAll("\\%", "%")
        .replaceAll("~", " ")
        .replace(/\{([^{}]*)\}/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

function findClosingBrace(source, openIndex) {
    let depth = 0;
    let quote = false;
    let escaped = false;

    for (let index = openIndex; index < source.length; index += 1) {
        const character = source[index];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (character === "\\") {
            escaped = true;
            continue;
        }

        if (character === '"') {
            quote = !quote;
            continue;
        }

        if (quote) continue;
        if (character === "{") depth += 1;
        if (character === "}") depth -= 1;
        if (depth === 0) return index;
    }

    return -1;
}

function parseFields(body) {
    const fields = {};
    let cursor = 0;

    while (cursor < body.length) {
        while (cursor < body.length && /[\s,]/.test(body[cursor])) cursor += 1;
        if (cursor >= body.length) break;

        const nameStart = cursor;
        while (cursor < body.length && /[\w-]/.test(body[cursor])) cursor += 1;
        const name = body.slice(nameStart, cursor).trim().toLowerCase();

        while (cursor < body.length && /\s/.test(body[cursor])) cursor += 1;
        if (!name || body[cursor] !== "=") {
            cursor += 1;
            continue;
        }

        cursor += 1;
        while (cursor < body.length && /\s/.test(body[cursor])) cursor += 1;

        let value = "";
        if (body[cursor] === "{") {
            const end = findClosingBrace(body, cursor);
            if (end === -1) break;
            value = body.slice(cursor + 1, end);
            cursor = end + 1;
        } else if (body[cursor] === '"') {
            cursor += 1;
            const start = cursor;
            let escaped = false;
            while (cursor < body.length) {
                if (!escaped && body[cursor] === '"') break;
                escaped = !escaped && body[cursor] === "\\";
                if (body[cursor] !== "\\") escaped = false;
                cursor += 1;
            }
            value = body.slice(start, cursor);
            cursor += 1;
        } else {
            const start = cursor;
            while (cursor < body.length && body[cursor] !== ",") cursor += 1;
            value = body.slice(start, cursor);
        }

        fields[name] = normalizeBibValue(value);
    }

    return fields;
}

function parseBibtex(source, sourceMeta) {
    const entries = [];
    const matcher = /@(\w+)\s*\{/g;
    let match;

    while ((match = matcher.exec(source)) !== null) {
        const openIndex = source.indexOf("{", match.index);
        const closeIndex = findClosingBrace(source, openIndex);
        if (closeIndex === -1) break;

        const entryBody = source.slice(openIndex + 1, closeIndex);
        const firstComma = entryBody.indexOf(",");
        if (firstComma !== -1) {
            const key = entryBody.slice(0, firstComma).trim();
            const fields = parseFields(entryBody.slice(firstComma + 1));
            entries.push({
                key,
                entryType: match[1].toLowerCase(),
                category: sourceMeta.category,
                categoryLabel: sourceMeta.label,
                fields
            });
        }

        matcher.lastIndex = closeIndex + 1;
    }

    return entries;
}

function publicationYear(entry) {
    const year = Number.parseInt(entry.fields.year, 10);
    return Number.isFinite(year) ? year : 0;
}

function publicationVenue(entry) {
    const fields = entry.fields;
    const venue = fields.booktitle || fields.journal || fields.howpublished || "";
    const details = [];

    if (fields.volume) details.push(fields.volume);
    if (fields.number) details.push(fields.number.startsWith("ICT") ? fields.number : `(${fields.number})`);
    if (fields.pages) details.push(`pp. ${fields.pages.replaceAll("--", "–")}`);

    return [venue, details.join(" ")].filter(Boolean).join(", ");
}

function authorMarkup(authorString = "") {
    const authors = normalizeBibValue(authorString)
        .split(/\s+and\s+/i)
        .map((author) => author.trim())
        .filter(Boolean)
        .map((author) => {
            const escaped = escapeHtml(author);
            if (/Shunpei Yamaguchi|山口\s*隼平/.test(author)) {
                return `<strong>${escaped}</strong>`;
            }
            return escaped;
        });

    return authors.join(", ");
}

function publicationLinks(entry) {
    const links = [];
    const { doi, url } = entry.fields;

    if (doi) {
        const doiUrl = doi.startsWith("http") ? doi : `https://doi.org/${doi}`;
        links.push(`<a href="${escapeHtml(doiUrl)}" target="_blank" rel="noreferrer">DOI</a>`);
    }

    if (url) {
        links.push(`<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Link</a>`);
    }

    return links.join("");
}

function sortPublications(entries) {
    return [...entries].sort((left, right) => {
        const yearDifference = publicationYear(right) - publicationYear(left);
        if (yearDifference !== 0) return yearDifference;

        const categoryDifference = categoryRank[left.category] - categoryRank[right.category];
        if (categoryDifference !== 0) return categoryDifference;

        return left.key.localeCompare(right.key);
    });
}

function renderSelected() {
    const container = document.getElementById("selectedList");
    const selected = selectedKeys
        .map((key) => publications.find((entry) => entry.key === key))
        .filter(Boolean);

    container.innerHTML = selected.map((entry) => {
        const title = escapeHtml(normalizeBibValue(entry.fields.title));
        const destination = entry.fields.url || (entry.fields.doi
            ? (entry.fields.doi.startsWith("http") ? entry.fields.doi : `https://doi.org/${entry.fields.doi}`)
            : "#publications");

        return `
            <a class="selected-item" href="${escapeHtml(destination)}"${destination.startsWith("http") ? ' target="_blank" rel="noreferrer"' : ""}>
                <p class="selected-meta">${publicationYear(entry)}<br>${escapeHtml(entry.categoryLabel)}</p>
                <div>
                    <h3 class="selected-title">${title}</h3>
                    <p class="selected-authors">${authorMarkup(entry.fields.author)}</p>
                    <p class="selected-venue">${escapeHtml(publicationVenue(entry))}</p>
                </div>
                <span class="selected-arrow" aria-hidden="true">↗</span>
            </a>`;
    }).join("");
}

function renderPublications() {
    const container = document.getElementById("publicationList");
    const filtered = activeFilter === "all"
        ? publications
        : publications.filter((entry) => entry.category === activeFilter);

    document.getElementById("publicationCount").textContent = filtered.length;

    const byYear = filtered.reduce((groups, entry) => {
        const year = publicationYear(entry) || "Other";
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year).push(entry);
        return groups;
    }, new Map());

    if (filtered.length === 0) {
        container.innerHTML = '<p class="loading">No publications in this category.</p>';
        return;
    }

    container.innerHTML = [...byYear.entries()].map(([year, entries]) => `
        <section class="publication-year" aria-labelledby="year-${year}">
            <h3 id="year-${year}">${year}</h3>
            <div class="publication-items">
                ${entries.map((entry) => `
                    <article class="publication-item">
                        <p class="publication-type">${escapeHtml(entry.categoryLabel)}</p>
                        <div>
                            <h4 class="publication-title">${escapeHtml(normalizeBibValue(entry.fields.title))}</h4>
                            <p class="publication-authors">${authorMarkup(entry.fields.author)}</p>
                            <p class="publication-venue">${escapeHtml(publicationVenue(entry))}</p>
                        </div>
                        <div class="publication-links">${publicationLinks(entry)}</div>
                    </article>`).join("")}
            </div>
        </section>`).join("");
}

function setupFilters() {
    document.querySelectorAll(".filter-button").forEach((button) => {
        button.addEventListener("click", () => {
            activeFilter = button.dataset.filter;
            document.querySelectorAll(".filter-button").forEach((candidate) => {
                candidate.classList.toggle("is-active", candidate === button);
            });
            renderPublications();
        });
    });
}

function setLanguage(language) {
    const root = document.documentElement;
    const switcher = document.getElementById("languageSwitch");
    root.dataset.lang = language;
    root.lang = language;
    switcher.innerHTML = language === "ja"
        ? '<span class="language-current">JA</span><span class="language-divider">/</span><span>EN</span>'
        : '<span>JA</span><span class="language-divider">/</span><span class="language-current">EN</span>';
    window.localStorage.setItem("site-language", language);
}

function setupLanguageSwitch() {
    const savedLanguage = window.localStorage.getItem("site-language");
    if (savedLanguage === "en") setLanguage("en");

    document.getElementById("languageSwitch").addEventListener("click", () => {
        setLanguage(document.documentElement.dataset.lang === "ja" ? "en" : "ja");
    });
}

async function loadPublications() {
    const responses = await Promise.all(publicationSources.map(async (source) => {
        const response = await fetch(source.path);
        if (!response.ok) throw new Error(`Could not load ${source.path}`);
        return parseBibtex(await response.text(), source);
    }));

    publications = sortPublications(responses.flat());
    renderSelected();
    renderPublications();
}

document.getElementById("year").textContent = new Date().getFullYear();
setupLanguageSwitch();
setupFilters();

loadPublications().catch((error) => {
    document.getElementById("selectedList").innerHTML = "";
    document.getElementById("publicationList").innerHTML = "";
    const message = document.getElementById("publicationError");
    message.hidden = false;
    message.textContent = "Publications could not be loaded. Please open this page through a web server.";
    console.error(error);
});
