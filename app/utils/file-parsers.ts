/**
 * Extract text content from a PDF file
 * Uses dynamic import to avoid SSR issues with pdfjs-dist
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')

  // Disable worker to avoid CDN/loading issues (fine for small recipe PDFs)
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise
  const textParts: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: unknown) => (item as { str: string }).str)
      .join(' ')
    textParts.push(pageText)
  }

  return textParts.join('\n')
}

/**
 * Extract text content from a DOCX file
 * Uses dynamic import to avoid SSR issues
 */
export async function extractTextFromDOCX(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

/**
 * Extract text from a file based on its type
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const fileName = file.name.toLowerCase()

  if (fileName.endsWith('.pdf')) {
    return extractTextFromPDF(file)
  }

  if (fileName.endsWith('.docx')) {
    return extractTextFromDOCX(file)
  }

  if (fileName.endsWith('.txt')) {
    return file.text()
  }

  throw new Error(`Unsupported file type: ${fileName}. Please use .txt, .pdf, or .docx files.`)
}
