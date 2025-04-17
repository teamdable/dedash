import React from "react";
import PropTypes from "prop-types";
import WarningTwoTone from "@ant-design/icons/WarningTwoTone";
import TimeAgo from "@/components/TimeAgo";
import Tooltip from "@/components/Tooltip";
import useAddToDashboardDialog from "../hooks/useAddToDashboardDialog";
import useEmbedDialog from "../hooks/useEmbedDialog";
import QueryControlDropdown from "@/components/EditVisualizationButton/QueryControlDropdown";
import EditVisualizationButton from "@/components/EditVisualizationButton";
import useQueryResultData from "@/lib/useQueryResultData";
import { durationHumanize, pluralize, prettySize } from "@/lib/utils";

import "./QueryExecutionMetadata.less";

export default function QueryExecutionMetadata({
  query,
  queryResult,
  isQueryExecuting,
  selectedVisualization,
  showEditVisualizationButton,
  onEditVisualization,
  extraActions,
}) {
  const queryResultData = useQueryResultData(queryResult);
  const openAddToDashboardDialog = useAddToDashboardDialog(query);
  const openEmbedDialog = useEmbedDialog(query);

  const dataScanned = queryResultData.metadata?.data_scanned;
  let queryCostDisplay = null;

  if (dataScanned && dataScanned > 0) {
    const bytesPerTB = 1024 ** 4;
    const costPerTBUSD = 5;
    const krwPerUSD = 1400;
    const overheadMultiplier = 1.1;

    const costUSD = (dataScanned / bytesPerTB) * costPerTBUSD * overheadMultiplier;
    const costKRW = costUSD * krwPerUSD;

    const formattedUSD = `$${costUSD.toFixed(2)}`;
    const formattedKRW = (typeof Intl !== 'undefined' && Intl.NumberFormat)
      ? new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(costKRW)
      : `₩${Math.round(costKRW).toLocaleString()}`;

    queryCostDisplay = `${formattedUSD} (${formattedKRW})`;
  }

  return (
    <div className="query-execution-metadata">
      <span className="m-r-5">
        <QueryControlDropdown
          query={query}
          queryResult={queryResult}
          queryExecuting={isQueryExecuting}
          showEmbedDialog={openEmbedDialog}
          embed={false}
          apiKey={query.api_key}
          selectedTab={selectedVisualization}
          openAddToDashboardForm={openAddToDashboardDialog}
        />
      </span>
      {extraActions}
      {showEditVisualizationButton && (
        <EditVisualizationButton openVisualizationEditor={onEditVisualization} selectedTab={selectedVisualization} />
      )}
      <span className="m-l-5 m-r-10">
        <span>
          {queryResultData.truncated === true && (
            <span className="m-r-5">
              <Tooltip
                title={
                  "Result truncated to " +
                  queryResultData.rows.length +
                  " rows. Databricks may truncate query results that are unstably large."
                }>
                <WarningTwoTone twoToneColor="#FF9800" />
              </Tooltip>
            </span>
          )}
          <strong>{queryResultData.rows.length}</strong> {pluralize("row", queryResultData.rows.length)}
        </span>
        <span className="m-l-5">
          {!isQueryExecuting && (
            <React.Fragment>
              <strong>{durationHumanize(queryResultData.runtime)}</strong>
              <span className="hidden-xs"> runtime</span>
            </React.Fragment>
          )}
          {isQueryExecuting && <span>Running&hellip;</span>}
        </span>
        {queryCostDisplay && (
          <span className="m-l-5">
            Query Cost{' '}
            <strong>{queryCostDisplay}</strong>
          </span>
        )}
      </span>
      <div>
        <span className="m-r-10">
          <span className="hidden-xs">Refreshed </span>
          <strong>
            <TimeAgo date={queryResultData.retrievedAt} placeholder="-" />
          </strong>
        </span>
      </div>
    </div>
  );
}

QueryExecutionMetadata.propTypes = {
  query: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  queryResult: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  isQueryExecuting: PropTypes.bool,
  selectedVisualization: PropTypes.number,
  showEditVisualizationButton: PropTypes.bool,
  onEditVisualization: PropTypes.func,
  extraActions: PropTypes.node,
};

QueryExecutionMetadata.defaultProps = {
  isQueryExecuting: false,
  selectedVisualization: null,
  showEditVisualizationButton: false,
  onEditVisualization: () => {},
  extraActions: null,
};
