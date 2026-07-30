import stylesheets from "@/data/stylesheets.json";

/**
 * Codeforces serves its static assets from /codeforces.org/s/<version>/... on
 * codeforces.com. We mirrored that exact path layout under public/, so every relative
 * url() inside their stylesheets (../images/roundbox/..., ../fonts/...) resolves without
 * any rewriting.
 */
export const CF_STATIC = "/codeforces.org/s/94651";

export const cfAsset = (path: string) => `${CF_STATIC}/${path.replace(/^\//, "")}`;

/**
 * Every stylesheet in the live page's <head>, in document order - linked files and the
 * inline <style> blocks extracted alongside them (see tools/extract_inline_css.py).
 * The order is load-bearing, not cosmetic: several selectors are defined twice at equal
 * specificity, so reordering silently changes which declaration wins.
 */
export const CF_STYLESHEETS: string[] = stylesheets;
