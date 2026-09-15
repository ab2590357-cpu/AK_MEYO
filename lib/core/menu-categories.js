export function menuCategoryNames(grouped = {}) {
  return Object.keys(grouped)
    .filter((name) => Array.isArray(grouped[name]) && grouped[name].length > 0)
    .sort((a, b) => a.localeCompare(b));
}

export function menuCategoryRows(grouped = {}, { columns = 3 } = {}) {
  const width = Math.max(1, Number(columns) || 1);
  const names = menuCategoryNames(grouped).map((name) => name.toUpperCase());
  const rows = [];
  for (let i = 0; i < names.length; i += width) rows.push(names.slice(i, i + width).join(' | '));
  return rows;
}
