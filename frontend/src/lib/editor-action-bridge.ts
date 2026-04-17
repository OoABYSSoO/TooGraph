export type LiveEditorActionRefMap<T> = Record<string, T | null>;

type EditorSaveAction = () => Promise<boolean> | boolean | undefined;
type EditorVoidAction = () => void | Promise<void>;
type EditorRenameAction = (name: string) => void | Promise<void>;

type EditorActionShape = {
  save?: EditorSaveAction;
  validate?: EditorVoidAction;
  run?: EditorVoidAction;
  toggleStatePanel?: EditorVoidAction;
  setGraphName?: EditorRenameAction;
};

function getActiveEditorActions<T extends EditorActionShape>(
  actionsRef: { current: LiveEditorActionRefMap<T> },
  activeTabIdRef: { current: string | null },
): T | null {
  const activeTabId = activeTabIdRef.current;
  if (!activeTabId) {
    return null;
  }
  return actionsRef.current[activeTabId] ?? null;
}

export function createLiveEditorActionBridge<T extends EditorActionShape>(
  actionsRef: { current: LiveEditorActionRefMap<T> },
  activeTabIdRef: { current: string | null },
) {
  return {
    save: () => getActiveEditorActions(actionsRef, activeTabIdRef)?.save?.(),
    validate: () => getActiveEditorActions(actionsRef, activeTabIdRef)?.validate?.(),
    run: () => getActiveEditorActions(actionsRef, activeTabIdRef)?.run?.(),
    toggleStatePanel: () => getActiveEditorActions(actionsRef, activeTabIdRef)?.toggleStatePanel?.(),
    setGraphName: (name: string) => getActiveEditorActions(actionsRef, activeTabIdRef)?.setGraphName?.(name),
  };
}
