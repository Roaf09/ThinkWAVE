// Fixed 3-line text boxes for saved Question Bank cards.
// The box stays exactly 3 lines tall no matter how short the text is;
// longer text is cut with "...". Set the fixed height with style (it must
// equal 3 lines, e.g. height "4.5em" with lineHeight 1.5). Short text stays
// centered because the outer box is a centered flex row.
export function Clamp3({ className, style, children }) {
  return (
    <div className={className} style={{ display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", ...style }}>
      <div
        style={{
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          textAlign: "center",
          overflowWrap: "anywhere",
          wordBreak: "break-all",
          display: "-webkit-box",
          WebkitLineClamp: "3",
          WebkitBoxOrient: "vertical",
          lineClamp: "3",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {children}
      </div>
    </div>
  );
}
