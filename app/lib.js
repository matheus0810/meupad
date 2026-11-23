// Normaliza o nome do pad: minúsculas, sem acento, segmentos separados por "/".
export function normalizeName(raw) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split("/")
    .map((s) => s.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, ""))
    .filter(Boolean)
    .join("/")
    .slice(0, 200);
}
