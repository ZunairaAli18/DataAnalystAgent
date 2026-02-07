import polars as pl
import numpy as np
from typing import Dict, List, Optional, Any
from datetime import datetime
import uuid

class DataCleaner:
    """
    Handles all data cleaning operations for dataset versions.
    Each operation returns the cleaned DataFrame and metadata about changes.
    """
    
    @staticmethod
    def deduplicate(
        df: pl.DataFrame, 
        key_columns: Optional[List[str]] = None,
        keep: str = "first"  # "first", "last", "max_date"
    ) -> tuple[pl.DataFrame, Dict[str, Any]]:
        """
        FR-202: Remove duplicate rows
        
        Args:
            df: Input DataFrame
            key_columns: Columns to use for deduplication. If None, uses all columns
            keep: Strategy - "first", "last", or column name for max value
            
        Returns:
            (cleaned_df, metadata)
        """
        original_count = len(df)
        
        if key_columns is None:
            # Full row deduplication
            cleaned_df = df.unique(maintain_order=True)
        else:
            if keep == "first":
                cleaned_df = df.unique(subset=key_columns, keep="first")
            elif keep == "last":
                cleaned_df = df.unique(subset=key_columns, keep="last")
            else:
                # Assume keep is a date column - keep row with max date
                cleaned_df = df.sort(keep, descending=True).unique(
                    subset=key_columns, 
                    keep="first"
                )
        
        rows_removed = original_count - len(cleaned_df)
        
        metadata = {
            "operation": "deduplicate",
            "rows_affected": rows_removed,
            "params": {
                "key_columns": key_columns,
                "keep": keep
            },
            "original_count": original_count,
            "final_count": len(cleaned_df)
        }
        
        return cleaned_df, metadata
    
    @staticmethod
    def handle_missing_values(
        df: pl.DataFrame,
        column_strategies: Dict[str, Dict[str, Any]]
    ) -> tuple[pl.DataFrame, Dict[str, Any]]:
        """
        FR-203: Handle missing values with various strategies
        
        Args:
            column_strategies: {
                "column_name": {
                    "action": "drop_rows" | "fill" | "keep",
                    "fill_value": <value> | "mean" | "median" | "mode" | "Unknown"
                }
            }
            
        Returns:
            (cleaned_df, metadata)
        """
        cleaned_df = df.clone()
        changes = {}
        total_rows_dropped = 0
        
        for col, strategy in column_strategies.items():
            if col not in df.columns:
                continue
                
            action = strategy.get("action", "keep")
            original_nulls = cleaned_df[col].null_count()
            
            if action == "drop_rows":
                rows_before = len(cleaned_df)
                cleaned_df = cleaned_df.filter(pl.col(col).is_not_null())
                rows_dropped = rows_before - len(cleaned_df)
                total_rows_dropped += rows_dropped
                changes[col] = {
                    "action": "drop_rows",
                    "rows_dropped": rows_dropped
                }
                
            elif action == "fill":
                fill_value = strategy.get("fill_value")
                
                if fill_value == "mean":
                    fill_val = cleaned_df[col].mean()
                    cleaned_df = cleaned_df.with_columns(
                        pl.col(col).fill_null(fill_val)
                    )
                elif fill_value == "median":
                    fill_val = cleaned_df[col].median()
                    cleaned_df = cleaned_df.with_columns(
                        pl.col(col).fill_null(fill_val)
                    )
                elif fill_value == "mode":
                    # Get the most frequent value
                    mode_val = cleaned_df[col].drop_nulls().mode()[0]
                    cleaned_df = cleaned_df.with_columns(
                        pl.col(col).fill_null(mode_val)
                    )
                else:
                    # Direct value fill
                    cleaned_df = cleaned_df.with_columns(
                        pl.col(col).fill_null(fill_value)
                    )
                
                changes[col] = {
                    "action": "fill",
                    "fill_value": str(fill_value),
                    "nulls_filled": original_nulls
                }
        
        metadata = {
            "operation": "handle_missing",
            "rows_affected": total_rows_dropped,
            "params": column_strategies,
            "changes_by_column": changes
        }
        
        return cleaned_df, metadata
    
    @staticmethod
    def cast_types(
        df: pl.DataFrame,
        type_mappings: Dict[str, str]
    ) -> tuple[pl.DataFrame, Dict[str, Any]]:
        """
        FR-204: Cast column types with failure tracking
        
        Args:
            type_mappings: {"column_name": "Int64" | "Float64" | "String" | "Date" | "Datetime"}
            
        Returns:
            (cleaned_df, metadata)
        """
        cleaned_df = df.clone()
        casting_report = {}
        
        for col, target_type in type_mappings.items():
            if col not in df.columns:
                continue
            
            original_type = str(df[col].dtype)
            failures = 0
            
            try:
                if target_type == "Int64":
                    # Try casting, track failures
                    casted = cleaned_df[col].cast(pl.Int64, strict=False)
                    failures = casted.null_count() - cleaned_df[col].null_count()
                    cleaned_df = cleaned_df.with_columns(casted.alias(col))
                    
                elif target_type == "Float64":
                    casted = cleaned_df[col].cast(pl.Float64, strict=False)
                    failures = casted.null_count() - cleaned_df[col].null_count()
                    cleaned_df = cleaned_df.with_columns(casted.alias(col))
                    
                elif target_type == "String":
                    cleaned_df = cleaned_df.with_columns(
                        pl.col(col).cast(pl.String)
                    )
                    
                elif target_type in ["Date", "Datetime"]:
                    if original_type == "String":
                        casted = cleaned_df[col].str.to_datetime(strict=False)
                        failures = casted.null_count() - cleaned_df[col].null_count()
                        cleaned_df = cleaned_df.with_columns(casted.alias(col))
                
                casting_report[col] = {
                    "from": original_type,
                    "to": target_type,
                    "failures": failures,
                    "success": True
                }
                
            except Exception as e:
                casting_report[col] = {
                    "from": original_type,
                    "to": target_type,
                    "success": False,
                    "error": str(e)
                }
        
        metadata = {
            "operation": "cast_types",
            "rows_affected": 0,  # Casting doesn't drop rows
            "params": type_mappings,
            "casting_report": casting_report
        }
        
        return cleaned_df, metadata
    
    @staticmethod
    def normalize_strings(
        df: pl.DataFrame,
        columns: List[str],
        operations: List[str]  # ["trim", "lowercase", "uppercase", "remove_currency"]
    ) -> tuple[pl.DataFrame, Dict[str, Any]]:
        """
        FR-205: String normalization operations
        
        Args:
            columns: Columns to normalize
            operations: List of normalization operations to apply
        """
        cleaned_df = df.clone()
        
        for col in columns:
            if col not in df.columns:
                continue
                
            if df[col].dtype != pl.String:
                continue
            
            expr = pl.col(col)
            
            if "trim" in operations:
                expr = expr.str.strip_chars()
            
            if "lowercase" in operations:
                expr = expr.str.to_lowercase()
            elif "uppercase" in operations:
                expr = expr.str.to_uppercase()
            
            if "remove_currency" in operations:
                # Remove common currency symbols and commas
                expr = (expr
                    .str.replace_all(r"[₹$€£,]", "")
                    .str.strip_chars()
                )
            
            cleaned_df = cleaned_df.with_columns(expr.alias(col))
        
        metadata = {
            "operation": "normalize_strings",
            "rows_affected": 0,
            "params": {
                "columns": columns,
                "operations": operations
            }
        }
        
        return cleaned_df, metadata
    
    @staticmethod
    def detect_anomalies(
        df: pl.DataFrame,
        numeric_columns: List[str],
        method: str = "iqr",  # "iqr" or "zscore"
        threshold: float = 1.5  # IQR multiplier or z-score threshold
    ) -> tuple[pl.DataFrame, List[Dict[str, Any]]]:
        """
        FR-206: Detect anomalies in numeric columns
        
        Returns:
            (df_without_anomalies, anomaly_records)
        """
        anomalies = []
        df_clean = df.clone()
        
        for col in numeric_columns:
            if col not in df.columns or not df[col].dtype.is_numeric():
                continue
            
            if method == "iqr":
                q1 = df[col].quantile(0.25)
                q3 = df[col].quantile(0.75)
                iqr = q3 - q1
                lower_bound = q1 - threshold * iqr
                upper_bound = q3 + threshold * iqr
                
                # Find anomalies
                anomaly_mask = (
                    (pl.col(col) < lower_bound) | 
                    (pl.col(col) > upper_bound)
                ).fill_null(False)
                
            elif method == "zscore":
                mean = df[col].mean()
                std = df[col].std()
                
                if std == 0:
                    continue
                
                anomaly_mask = (
                    ((pl.col(col) - mean).abs() / std) > threshold
                ).fill_null(False)
                
            # Extract anomalous rows
            anomalous_rows = df.filter(anomaly_mask)
            
            for row in anomalous_rows.to_dicts():
                value = row[col]
                if method == "iqr":
                    score = abs(value - ((q1 + q3) / 2)) / (iqr if iqr > 0 else 1)
                else:
                    score = abs(value - mean) / (std if std > 0 else 1)
                
                anomalies.append({
                    "id": str(uuid.uuid4()),
                    "row_data": row,
                    "column": col,
                    "reason": f"outlier_{method}",
                    "score": float(score)
                })
            
            # Remove anomalies from clean df (optional - user decides)
            # For now, we just detect, don't remove
        
        return df_clean, anomalies
    
    @staticmethod
    def apply_cleaning_pipeline(
        df: pl.DataFrame,
        cleaning_config: Dict[str, Any]
    ) -> tuple[pl.DataFrame, List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Apply a full cleaning pipeline based on configuration
        
        Args:
            cleaning_config: {
                "deduplicate": {...},
                "missing_values": {...},
                "type_casting": {...},
                "normalize": {...},
                "detect_anomalies": {...}
            }
            
        Returns:
            (cleaned_df, transform_logs, anomalies)
        """
        current_df = df.clone()
        transform_logs = []
        all_anomalies = []
        
        # 1. Deduplication
        if "deduplicate" in cleaning_config:
            dedupe_config = cleaning_config["deduplicate"]
            current_df, metadata = DataCleaner.deduplicate(
                current_df,
                key_columns=dedupe_config.get("key_columns"),
                keep=dedupe_config.get("keep", "first")
            )
            transform_logs.append(metadata)
        
        # 2. Missing value handling
        if "missing_values" in cleaning_config:
            current_df, metadata = DataCleaner.handle_missing_values(
                current_df,
                cleaning_config["missing_values"]
            )
            transform_logs.append(metadata)
        
        # 3. Type casting
        if "type_casting" in cleaning_config:
            current_df, metadata = DataCleaner.cast_types(
                current_df,
                cleaning_config["type_casting"]
            )
            transform_logs.append(metadata)
        
        # 4. String normalization
        if "normalize" in cleaning_config:
            norm_config = cleaning_config["normalize"]
            current_df, metadata = DataCleaner.normalize_strings(
                current_df,
                columns=norm_config.get("columns", []),
                operations=norm_config.get("operations", [])
            )
            transform_logs.append(metadata)
        
        # 5. Anomaly detection
        if "detect_anomalies" in cleaning_config:
            anom_config = cleaning_config["detect_anomalies"]
            current_df, anomalies = DataCleaner.detect_anomalies(
                current_df,
                numeric_columns=anom_config.get("columns", []),
                method=anom_config.get("method", "iqr"),
                threshold=anom_config.get("threshold", 1.5)
            )
            all_anomalies.extend(anomalies)
        
        return current_df, transform_logs, all_anomalies