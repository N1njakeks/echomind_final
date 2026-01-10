// This service relies on the CDN script loaded in index.html
// to avoid complex build steps with workers in this environment.

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

export interface PdfResult {
  text: string;
  pageCount: number;
}

export const extractTextFromPdf = async (file: File): Promise<PdfResult> => {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js library not loaded");
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = '';
  const pageCount = pdf.numPages;
  
  // Iterate through all pages
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    
    fullText += `--- Page ${i} ---\n${pageText}\n\n`;
  }
  
  return {
    text: fullText.trim(),
    pageCount: pageCount
  };
};