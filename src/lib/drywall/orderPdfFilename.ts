/** `Order-{ProjectName}-{YYYY-MM-DD}.pdf` */
export function orderPdfFilename(projectName: string): string {
  const safeName = (projectName || 'Project').replace(/[^a-z0-9]/gi, '-')
  const date = new Date().toISOString().slice(0, 10)
  return `Order-${safeName}-${date}.pdf`
}
