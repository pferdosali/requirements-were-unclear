import React, { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";

export interface FolderNode {
  id: string;
  name: string;
  children?: FolderNode[];
}

interface FolderItemProps {
  node: FolderNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function FolderItem({ node, depth, selectedId, onSelect }: FolderItemProps) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isLeaf = !hasChildren;
  const isSelected = selectedId === node.id && isLeaf;

  const handleClick = () => {
    if (hasChildren) {
      // Parent folders only expand/collapse — not selectable as upload destinations
      setOpen((o) => !o);
    } else {
      onSelect(node.id);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-2 py-1.5 text-left transition-all duration-100"
        style={{
          paddingLeft: `${14 + depth * 16}px`,
          paddingRight: "10px",
          borderRadius: "0.375rem",
          background: isSelected
            ? "rgba(13,110,170,0.3)"
            : "transparent",
          color: isSelected
            ? "#e1ecf7"
            : hasChildren
            ? "#8ab0cc"
            : "#a8c8e8",
          cursor: hasChildren ? "default" : "pointer",
          opacity: hasChildren ? 0.85 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isSelected && isLeaf)
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
        title={hasChildren ? "Expand to see sub-folders" : `Upload to "${node.name}"`}
      >
        <span className="shrink-0 w-3.5 h-3.5 flex items-center justify-center">
          {hasChildren ? (
            open
              ? <ChevronDown size={11} style={{ color: "#3d5a72" }} />
              : <ChevronRight size={11} style={{ color: "#3d5a72" }} />
          ) : null}
        </span>
        {open && hasChildren
          ? <FolderOpen size={14} style={{ color: isSelected ? "#5dade2" : "#2e6a9e", flexShrink: 0 }} />
          : <Folder size={14} style={{ color: isSelected ? "#5dade2" : hasChildren ? "#1e4d72" : "#2e6a9e", flexShrink: 0 }} />
        }
        <span className="truncate text-xs" style={{ fontWeight: isSelected ? 500 : 400 }}>
          {node.name}
        </span>
        {/* Visual indicator that parent folders are not selectable */}
        {hasChildren && (
          <span className="ml-auto shrink-0 text-xs" style={{ color: "#2a4a62", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem" }}>
            {node.children!.length}
          </span>
        )}
      </button>
      {open && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <FolderItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FolderTreeProps {
  folders: FolderNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function FolderTree({ folders, selectedId, onSelect }: FolderTreeProps) {
  return (
    <div className="flex flex-col gap-0.5 py-1 px-2">
      {folders.map((node) => (
        <FolderItem
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
