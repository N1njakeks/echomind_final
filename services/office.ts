import mammoth from 'mammoth';
import JSZip from 'jszip';

export interface OfficeResult {
  text: string;
  pageCount: number; // Approximate for office docs
}

/**
 * Extracts raw text from a .docx file using Mammoth
 */
export const extractTextFromDocx = async (file: File): Promise<OfficeResult> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    
    // Approximate pages based on character count (avg 3000 chars per page)
    const text = result.value;
    const estimatedPages = Math.max(1, Math.ceil(text.length / 3000));
    
    return {
      text: text.trim(),
      pageCount: estimatedPages
    };
  } catch (error) {
    console.error("DOCX Extraction Error:", error);
    throw new Error("Failed to read Word document.");
  }
};

/**
 * Extracts text from a .pptx file by parsing XML slides inside the Zip structure
 */
export const extractTextFromPptx = async (file: File): Promise<OfficeResult> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    let fullText = "";
    let slideIndex = 1;
    
    // We assume slides are named slide1.xml, slide2.xml etc.
    // However, we need to find them and ideally sort them.
    const slideFiles: { name: string, content: string }[] = [];

    // 1. Load all slide XML files
    for (const filename of Object.keys(zip.files)) {
      if (filename.startsWith("ppt/slides/slide") && filename.endsWith(".xml")) {
         const content = await zip.files[filename].async("string");
         slideFiles.push({ name: filename, content });
      }
    }

    // 2. Sort by number (slide1, slide2, slide10...)
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.name.match(/slide(\d+)\.xml/)?.[1] || "0");
      const numB = parseInt(b.name.match(/slide(\d+)\.xml/)?.[1] || "0");
      return numA - numB;
    });

    // 3. Parse XML to extract text
    const parser = new DOMParser();
    
    for (const slide of slideFiles) {
      const xmlDoc = parser.parseFromString(slide.content, "text/xml");
      // Text in PPTX is usually in <a:t> tags
      const textNodes = xmlDoc.getElementsByTagName("a:t");
      
      let slideText = "";
      for (let i = 0; i < textNodes.length; i++) {
        slideText += textNodes[i].textContent + " ";
      }
      
      if (slideText.trim()) {
        fullText += `--- Slide ${slideIndex} ---\n${slideText.trim()}\n\n`;
      }
      slideIndex++;
    }

    return {
      text: fullText.trim() || "No text content found in slides.",
      pageCount: slideFiles.length
    };

  } catch (error) {
    console.error("PPTX Extraction Error:", error);
    throw new Error("Failed to read PowerPoint presentation.");
  }
};