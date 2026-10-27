export class ExportDataChangedError extends Error {}

/** Server boleh membatasi hasil lebih rendah dari ukuran halaman yang diminta. */
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>,
  expectedCount: number,
  maxRows = 5_000,
) {
  if (expectedCount > maxRows) throw new Error("Hasil ekspor terlalu banyak.");
  const rows: T[] = [];
  while (rows.length < expectedCount) {
    const { data, error, count } = await fetchPage(rows.length, Math.min(rows.length + 499, expectedCount - 1));
    if (error || count !== expectedCount || !data?.length) {
      throw new ExportDataChangedError("Data berubah atau ekspor tidak lengkap. Muat ulang dan coba kembali.");
    }
    rows.push(...data);
    if (rows.length > expectedCount) throw new ExportDataChangedError("Jumlah hasil ekspor berubah. Muat ulang dan coba kembali.");
  }
  return rows;
}
