export const ESC  = 0x1B;
export const GS   = 0x1D;
export const LF   = 0x0A;
export const INIT = [ESC, 0x40];                 // ESC @  — initialize printer
export const ALIGN_CENTER = [ESC, 0x61, 0x01];   // ESC a 1
export const ALIGN_LEFT   = [ESC, 0x61, 0x00];   // ESC a 0
export const BOLD_ON  = [ESC, 0x45, 0x01];        // ESC E 1
export const BOLD_OFF = [ESC, 0x45, 0x00];        // ESC E 0
export const FEED_CUT = [GS, 0x56, 0x00];         // GS V 0 — full cut
// Font A columns on the two standard thermal rolls (12-dot characters on a
// 203 dpi head: 384 dots → 32 cols, 576 dots → 48 cols). See deriveCols in
// buildEscPos.js for how other widths are mapped.
export const COLS_58MM = 32;
export const COLS_80MM = 48;
