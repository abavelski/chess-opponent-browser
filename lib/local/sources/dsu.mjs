import { htmlText, ratingFromText } from "./html.mjs";

export function parseDsuProfileHtml(html) {
  const values = new Map();
  for (const row of String(html ?? "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((match) => htmlText(match[1]));
    if (cells.length >= 2) values.set(cells[0].toLowerCase(), cells[1]);
  }

  if (!values.has("dansk rating")) {
    throw new Error("DSU profile layout changed: Dansk rating was not found.");
  }

  return {
    dsuRating: ratingFromText(values.get("dansk rating")),
    fideRating: ratingFromText(values.get("fide rating")),
    fideId: values.get("fide nummer")?.replace(/\D/g, "") || null,
  };
}

export async function openDsuParticipantTable(page, url) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("ul.tabs a", { timeout: 15000 });
  const count = await page.$$eval("ul.tabs a", (tabs) => tabs.length);
  if (!count) throw new Error("No tournament tabs found.");
  await page.click(`ul.tabs li:nth-child(${count}) a`);
  await page.waitForSelector("#tour-players table", { timeout: 15000 });
}

export async function extractVisibleDsuParticipants(page) {
  return page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const normalize = (value) => clean(value).toLowerCase();
    const tables = Array.from(document.querySelectorAll("#tour-players table")).filter((table) => {
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) => normalize(th.textContent));
      return headers.includes("navn") && headers.includes("rating (std.)");
    });

    return tables.flatMap((table) => {
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) => normalize(th.textContent));
      const at = (name) => headers.indexOf(name);
      const group = clean(table.querySelector("caption")?.textContent).replace(/^Deltagere i gruppen\s*/i, "").trim();
      return Array.from(table.querySelectorAll("tbody tr")).map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        const name = clean(cells[at("navn")]?.textContent);
        if (!name) return null;
        const dsuCell = cells[at("dsu")];
        const fideCell = cells[at("fide")];
        const dsuLink = dsuCell?.querySelector("a[href]");
        const fideLink = fideCell?.querySelector("a[href]");
        return {
          name,
          group: group || null,
          dsuId: clean(dsuCell?.textContent) || null,
          fideId: clean(fideCell?.textContent).replace(/^-$/, "") || null,
          club: at("klubber") >= 0 ? clean(cells[at("klubber")]?.textContent) || null : null,
          tournamentDsuRating: at("rating (std.)") >= 0 ? clean(cells[at("rating (std.)")]?.textContent) : null,
          tournamentFideRating: at("fide rating") >= 0 ? clean(cells[at("fide rating")]?.textContent) : null,
          registeredAt: at("tilmeldt") >= 0 ? clean(cells[at("tilmeldt")]?.textContent) || null : null,
          dsuProfileUrl: dsuLink ? new URL(dsuLink.getAttribute("href"), document.baseURI).href : null,
          fideProfileUrl: fideLink ? new URL(fideLink.getAttribute("href"), document.baseURI).href : null,
        };
      }).filter(Boolean);
    });
  });
}

export async function fetchDsuProfile(page, player) {
  if (!player.dsuProfileUrl) return { status: "skipped", reason: "No DSU profile URL." };
  await page.goto(player.dsuProfileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#medlem-detaljer table", { timeout: 10000 });
  return { status: "updated", ...parseDsuProfileHtml(await page.content()) };
}
