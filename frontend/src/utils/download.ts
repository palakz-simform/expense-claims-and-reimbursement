// Save a Blob (receipt, CSV) as a file. Needed because these endpoints require the Bearer header,
// so a plain <a href> cannot download them: we fetch with axios, then hand the bytes to the browser.
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Free the memory once the browser has started the download
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
