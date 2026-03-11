/**
 * Write HTML content to the system clipboard.
 * Supports both plain text and rich HTML clipboard modes.
 */
export async function copyToClipboard(html: string): Promise<void> {
    // Use the Clipboard API with HTML MIME type
    const blob = new Blob([html], { type: 'text/html' });
    const plainBlob = new Blob([html], { type: 'text/plain' });

    const clipboardItem = new ClipboardItem({
        'text/html': blob,
        'text/plain': plainBlob,
    });

    await navigator.clipboard.write([clipboardItem]);
}
