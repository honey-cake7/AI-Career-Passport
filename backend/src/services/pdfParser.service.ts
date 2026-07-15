import { PDFParse } from 'pdf-parse';

/**
 * Extract raw text content from a PDF buffer.
 *
 * Uses pdf-parse v2's class-based API:
 *   1. Instantiate PDFParse with the buffer as `data`
 *   2. Call getText() to extract structured text
 *   3. Return the concatenated text string
 *
 * @param pdfBuffer - The raw PDF file buffer (e.g., from multer memory storage)
 * @returns The extracted text content as a string
 */
export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  try {
    // pdf-parse v2 accepts a Uint8Array via LoadParameters.data
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });

    const textResult = await parser.getText();

    // textResult.text contains the concatenated text from all pages
    const rawText = textResult.text;

    if (!rawText || rawText.trim().length === 0) {
      // Cleanup before throwing
      await parser.destroy();
      throw new Error('No text content could be extracted from the PDF');
    }

    // Clean up the extracted text: normalize whitespace, remove excessive newlines
    const cleanedText = rawText
      .replace(/\r\n/g, '\n')           // Normalize line endings
      .replace(/\n{3,}/g, '\n\n')       // Collapse 3+ newlines to 2
      .replace(/[ \t]{2,}/g, ' ')        // Collapse multiple spaces/tabs
      .trim();

    console.log(`📄 PDF parsed: ${cleanedText.length} chars extracted`);

    // Release resources
    await parser.destroy();

    return cleanedText;
  } catch (error) {
    if (error instanceof Error && error.message.includes('No text content')) {
      throw error;
    }
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}
