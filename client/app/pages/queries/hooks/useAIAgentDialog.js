import { useCallback } from "react";
import { DialogPropType } from "@/components/DialogWrapper";
import AIAgentDialog from "@/components/queries/AIAgentDialog";

export default function useAIAgentDialog(query, queryResult, dataSource, onApply) {
  return useCallback(
    () =>
      AIAgentDialog.showModal({
        query,
        queryResult,
        dataSource,
        onApply,
      }),
    [query, queryResult, dataSource, onApply]
  );
}

useAIAgentDialog.dialogPropType = DialogPropType;
