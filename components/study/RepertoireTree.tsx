'use client';

import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, FolderOpen, BookOpen, Plus, Trash2 } from 'lucide-react';
import type { Repertoire, RepertoireEdge } from '@/types/chess';

interface TreeNode {
  nodeId: string;
  san: string;
  children: TreeNode[];
  edge: RepertoireEdge;
  depth: number;
}

interface RepertoireTreeProps {
  repertoires: Repertoire[];
  activeRepertoireId: string | null;
  treeData: TreeNode[];
  onSelectRepertoire: (id: string) => void;
  onSelectNode: (nodeId: string) => void;
  onCreateRepertoire: () => void;
  onDeleteRepertoire: (id: string) => void;
  selectedNodeId: string | null;
}

function TreeItem({
  node,
  onSelect,
  selectedNodeId,
}: {
  node: TreeNode;
  onSelect: (nodeId: string) => void;
  selectedNodeId: string | null;
}) {
  const [isOpen, setIsOpen] = useState(node.depth < 3);
  const hasChildren = node.children.length > 0;

  return (
    <div className="select-none">
      <button
        type="button"
        className={`group flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm transition-colors ${
          selectedNodeId === node.nodeId
            ? 'bg-[#10B981]/20 text-[#10B981]'
            : 'text-gray-300 hover:bg-white/5 hover:text-white'
        }`}
        onClick={() => {
          onSelect(node.nodeId);
          if (hasChildren) setIsOpen(!isOpen);
        }}
        style={{ paddingLeft: `${node.depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          isOpen ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />
        ) : (
          <span className="h-3 w-3 flex-shrink-0" />
        )}
        <span className="font-mono text-xs">{node.san}</span>
        {node.children.length > 1 && (
          <span className="ml-auto text-[0.6rem] text-gray-500">{node.children.length} vars</span>
        )}
      </button>
      {isOpen && hasChildren && (
        <div>
          {node.children.map((child, i) => (
            <TreeItem key={`${child.nodeId}-${i}`} node={child} onSelect={onSelect} selectedNodeId={selectedNodeId} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function RepertoireTree({
  repertoires,
  activeRepertoireId,
  treeData,
  onSelectRepertoire,
  onSelectNode,
  onCreateRepertoire,
  onDeleteRepertoire,
  selectedNodeId,
}: RepertoireTreeProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Repertoire list */}
      <div className="border-b border-white/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Repertoires</h3>
          <button
            type="button"
            onClick={onCreateRepertoire}
            className="flex h-6 w-6 items-center justify-center rounded bg-[#10B981]/20 text-[#10B981] transition-colors hover:bg-[#10B981]/30"
            aria-label="Create repertoire"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        
        <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
          {repertoires.length === 0 ? (
            <p className="text-xs text-gray-500 italic py-2">No repertoires yet</p>
          ) : (
            repertoires.map((rep) => (
              <div key={rep.id} className="flex items-center group">
                <button
                  type="button"
                  onClick={() => onSelectRepertoire(rep.id)}
                  className={`flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                    activeRepertoireId === rep.id
                      ? 'bg-[#8B5CF6]/20 text-[#8B5CF6]'
                      : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  {rep.color === 'white' ? (
                    <span className="h-3 w-3 rounded-full bg-white border border-gray-400" />
                  ) : (
                    <span className="h-3 w-3 rounded-full bg-gray-800 border border-gray-500" />
                  )}
                  <span className="truncate">{rep.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteRepertoire(rep.id)}
                  className="mr-1 hidden h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-red-500/20 hover:text-red-400 group-hover:flex"
                  aria-label={`Delete ${rep.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Move tree */}
      <div className="flex-1 overflow-y-auto p-2 [scrollbar-width:thin] [scrollbar-color:#4B5563_transparent]">
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <BookOpen className="h-3.5 w-3.5 text-gray-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Move Tree</h3>
        </div>
        {treeData.length === 0 ? (
          <p className="text-xs text-gray-500 italic py-4 text-center">Select a repertoire to view moves</p>
        ) : (
          treeData.map((node, i) => (
            <TreeItem key={`${node.nodeId}-${i}`} node={node} onSelect={onSelectNode} selectedNodeId={selectedNodeId} />
          ))
        )}
      </div>
    </div>
  );
}
