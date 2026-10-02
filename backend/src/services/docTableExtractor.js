import mammoth from 'mammoth';

// mammoth renders every Word table as plain <table><tr><td> markup with no
// nesting of its own — Word doesn't let you put a table inside a table cell
// via the normal UI — so a small regex walk is enough; pulling in a real DOM
// parser for this one shape would be the heavier dependency.
function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns one rows[][] (array-of-arrays, same shape XLSX.utils.sheet_to_json
// with header:1 produces) per <table> found in the document, in document order.
export async function extractTablesFromDocx(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const tables = [];
  const tableRe = /<table>([\s\S]*?)<\/table>/g;
  let tableMatch;
  while ((tableMatch = tableRe.exec(html))) {
    const rows = [];
    const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRe.exec(tableMatch[1]))) {
      const cells = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
      let cellMatch;
      while ((cellMatch = cellRe.exec(rowMatch[1]))) {
        cells.push(stripTags(cellMatch[1]));
      }
      rows.push(cells);
    }
    tables.push(rows);
  }
  return tables;
}
