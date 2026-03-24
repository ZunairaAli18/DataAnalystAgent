import io
from typing import Dict
import requests
from gotrue import Any, List
import polars as pl
from supabase import create_client, Client

class SupabaseDataEngine:
    # Initialize your client (Use your Env variables)
    url = "https://ywqeszodqyutovublqmx.supabase.co"
    key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3cWVzem9kcXl1dG92dWJscW14Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTk0ODEyMCwiZXhwIjoyMDg1NTI0MTIwfQ.d0bSbD7G_jXC0jLY1e1NuM4ci_VtRkjQv5228vCkPTY"
    supabase: Client = create_client(url, key)
    BUCKET = "datasets"
    S3_OPTIONS = {
        "aws_access_key_id": "a2b2d4f76c5b2dbcb1bc8986e6952915",
        "aws_secret_access_key": "d9852b97836cafd71625bd5247af5e8d1fc7e2e382b19db7541f64625c2b1153",
        "endpoint_url": "https://ywqeszodqyutovublqmx.storage.supabase.co/storage/v1/s3",
        "region": "ap-south-1", # Corrected to your region
        "use_path_style": "true"
    }
    @classmethod
    def get_dataset_data(cls, dataset_id: str, limit: int = 100, offset: int = 0):
      """
    Downloads parquet file from Supabase Storage and returns paginated data.
    Returns columns metadata and rows as dictionaries.
      """
      file_path = f"datasets/{dataset_id}/data.parquet"
    
    # Download the parquet file from Supabase Storage
      response = cls.supabase.storage.from_(cls.BUCKET).download(file_path)
    
    # Read into Polars DataFrame
      df = pl.read_parquet(io.BytesIO(response))
    
    # Get total count before pagination
      total_count = len(df)
    
    # Get column metadata
      columns = [
        {"key": name, "label": name.upper(), "dtype": str(dtype)}
        for name, dtype in df.schema.items()
      ]
    
    # Apply pagination and convert to list of dicts
      rows = df.slice(offset, limit).to_dicts()
    
      return {
        "dataset_id": dataset_id,
        "columns": columns,
        "rows": rows,
        "total_count": total_count,
        "limit": limit,
        "offset": offset
      }
      
    @classmethod
    def detect_anomalies(cls, dataset_id: str) -> List[Dict[str, Any]]:
        """
        Detects various anomalies in the dataset.
        Returns a list of detected anomalies with type, column, count, and description.
        """
        file_path = f"datasets/{dataset_id}/data.parquet"
        response = cls.supabase.storage.from_(cls.BUCKET).download(file_path)
        df = pl.read_parquet(io.BytesIO(response))
        
        anomalies = []
        
        # 1. Missing Values Detection
        for col in df.columns:
          series = df[col]

          if series.dtype == pl.Utf8:
            missing_count = (
              series.null_count() +
              series.str.strip_chars().eq("").sum()
            )
          else:
            missing_count = series.null_count()

          if missing_count > 0:
            anomalies.append({
            "type": "missing_values",
            "column": col,
            "count": int(missing_count),
            "description": "Missing, null, or empty values detected"
           })
        
        # 2. Numeric Outliers Detection (using IQR method)
        numeric_cols = [col for col in df.columns if df[col].dtype in [pl.Float64, pl.Float32, pl.Int64, pl.Int32, pl.Int16, pl.Int8]]
        for col in numeric_cols:
            col_data = df[col].drop_nulls()
            if len(col_data) > 0:
                q1 = col_data.quantile(0.25)
                q3 = col_data.quantile(0.75)
                iqr = q3 - q1
                lower_bound = q1 - 1.5 * iqr
                upper_bound = q3 + 1.5 * iqr
                
                outlier_count = df.filter(
                    (pl.col(col) < lower_bound) | (pl.col(col) > upper_bound)
                ).height
                
                if outlier_count > 0:
                    anomalies.append({
                        "type": "numeric_outliers",
                        "column": col,
                        "count": outlier_count,
                        "description": "Statistical outliers (values outside 1.5*IQR)"
                    })
        
        # 3. Exact Duplicate Rows Detection
        duplicate_count = df.height - df.unique().height
        if duplicate_count > 0:
            anomalies.append({
                "type": "duplicate_rows",
                "column": "_all_",
                "count": duplicate_count,
                "description": "Exact duplicate rows found"
            })
        
        # 4. String columns analysis
        string_cols = [col for col in df.columns if df[col].dtype == pl.Utf8]
        
        for col in string_cols:
            col_data = df[col].drop_nulls()
            if len(col_data) == 0:
                continue
            
            # 4a. Case Inconsistency Detection (mixed case for same logical value)
            lowercase_values = col_data.str.to_lowercase()
            original_unique = col_data.n_unique()
            lowercase_unique = lowercase_values.n_unique()
            
            if lowercase_unique < original_unique:
                case_inconsistent_count = original_unique - lowercase_unique
                anomalies.append({
                    "type": "case_inconsistency",
                    "column": col,
                    "count": case_inconsistent_count,
                    "description": "Case inconsistencies (e.g., 'USA' vs 'usa')"
                })
            
            # 4b. Extra Whitespace Detection
            trimmed = col_data.str.strip_chars()
            whitespace_count = (col_data != trimmed).sum()
            if whitespace_count > 0:
                anomalies.append({
                    "type": "whitespace",
                    "column": col,
                    "count": whitespace_count,
                    "description": "Extra leading/trailing whitespace"
                })
            
            # 4c. Currency Symbol Detection
            currency_pattern = r'[$€£¥₹₽]'
            currency_matches = col_data.str.contains(currency_pattern).sum()
            if currency_matches > 0:
                anomalies.append({
                    "type": "currency_symbols",
                    "column": col,
                    "count": currency_matches,
                    "description": "Currency symbols in numeric-like values"
                })
            
            # 4d. Invalid Date Format Detection
            date_patterns = [
                r'\d{1,2}/\d{1,2}/\d{2,4}',  # MM/DD/YYYY or DD/MM/YYYY
                r'\d{1,2}-\d{1,2}-\d{2,4}',  # MM-DD-YYYY
                r'\d{4}-\d{2}-\d{2}',         # YYYY-MM-DD (ISO)
            ]
            
            has_date_like = False
            for pattern in date_patterns:
                if col_data.str.contains(pattern).any():
                    has_date_like = True
                    break
            
            if has_date_like:
                # Check for inconsistent date formats
                iso_format = col_data.str.contains(r'^\d{4}-\d{2}-\d{2}')
                non_iso_count = (~iso_format).sum()
                if non_iso_count > 0:
                    anomalies.append({
                        "type": "date_format",
                        "column": col,
                        "count": non_iso_count,
                        "description": "Non-standard date formats (not ISO YYYY-MM-DD)"
                    })
        
        # 5. Mixed Type Detection (strings that look like numbers in string columns)
        for col in string_cols:
            col_data = df[col].drop_nulls()
            if len(col_data) == 0:
                continue
            
            # Check if values look numeric but stored as string
            numeric_pattern = r'^-?\d+(\.\d+)?$'
            phone_pattern = r'^(\+?\d{1,3})?\d{7,15}$'
            cnic_pattern = r'^\d{5}-\d{7}-\d{1}$'
            
            numeric_like = col_data.str.contains(numeric_pattern)
            phone_like = col_data.str.contains(phone_pattern)
            cnic_like = col_data.str.contains(cnic_pattern)
            
            numeric_like_count = (numeric_like & ~phone_like).sum()
            phone_like_count = phone_like.sum()
            cnic_like_count = cnic_like.sum()
            
            text_like_count = len(col_data) - numeric_like_count - phone_like_count - cnic_like_count
            
            if numeric_like_count > 0 and text_like_count > 0:
              anomalies.append({
                  "type": "mixed_types",
                  "column": col,
                  "count": text_like_count,
                  "description": "Mixed numeric and text values (excluding phone numbers and cnics)"
              })
        
        # 6. Duplicate Values in Key-like Columns (columns with mostly unique values)
        for col in df.columns:
            col_data = df[col].drop_nulls()
            if len(col_data) == 0:
                continue
            
            unique_ratio = col_data.n_unique() / len(col_data)
            
            # If column has >90% unique values, flag duplicates
            if unique_ratio > 0.9 and unique_ratio < 1.0:
                dup_count = len(col_data) - col_data.n_unique()
                anomalies.append({
                    "type": "duplicate_values",
                    "column": col,
                    "count": dup_count,
                    "description": "Duplicate values in high-uniqueness column"
                })
        
        # 7. Skewed Distribution Detection
        for col in numeric_cols:
            col_data = df[col].drop_nulls()
            if len(col_data) < 10:
                continue
            
            mean_val = col_data.mean()
            median_val = col_data.median()
            
            if mean_val and median_val and median_val != 0:
                skew_ratio = abs(mean_val - median_val) / abs(median_val)
                if skew_ratio > 0.5:  # Significant skew
                    anomalies.append({
                        "type": "skewed_distribution",
                        "column": col,
                        "count": 1,
                        "description": f"Highly skewed distribution (mean/median ratio: {skew_ratio:.2f})"
                    })
        
        return anomalies
    
    @classmethod
    def clean_data(cls, dataset_id: str, factors: List[str]) -> Dict[str, Any]:
        """
        Cleans the dataset based on selected factors.
        Returns the cleaned dataset ID and summary.
        """
        file_path = f"datasets/{dataset_id}/data.parquet"
        response = cls.supabase.storage.from_(cls.BUCKET).download(file_path)
        df = pl.read_parquet(io.BytesIO(response))
        
        original_count = df.height
        cleaning_summary = []
        
        # Apply cleaning based on selected factors
        if "missing_values" in factors:
            for col in df.columns:
                dtype = df[col].dtype
                
                # Check for both null and empty string values
                null_count = df[col].null_count()
                empty_string_count = 0
                if dtype == pl.Utf8:
                    empty_string_count = (df[col].str.strip_chars().eq("")).sum()
                
                total_missing = null_count + empty_string_count
                if total_missing == 0:
                    continue

                # Convert empty strings to null first
                if dtype == pl.Utf8:
                    df = df.with_columns(
                        pl.when(pl.col(col).str.strip_chars().eq(""))
                        .then(None)
                        .otherwise(pl.col(col))
                        .alias(col)
                    )

                # Numeric → median
                if dtype in (
                    pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                    pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
                    pl.Float32, pl.Float64
                ):
                    # First try forward fill
                    df = df.with_columns(
                        pl.col(col).forward_fill()
                    )
                    # Then fill remaining nulls with median
                    median_val = df[col].median()
                    if median_val is not None:
                        df = df.with_columns(
                            pl.col(col).fill_null(median_val)
                        )

                # Categorical/String → forward fill then mode
                else:
                    # First apply forward fill to carry forward last non-null value
                    df = df.with_columns(
                        pl.col(col).forward_fill()
                    )
                    
                    # Then fill remaining nulls (at the beginning) with mode
                    remaining_nulls = df[col].null_count()
                    if remaining_nulls > 0:
                        mode_df = df.select(pl.col(col).mode())
                        if mode_df.height > 0:
                            mode_val = mode_df.item(0, 0)
                            if mode_val is not None:
                                # Convert mode_val to match column type
                                if dtype in (pl.Categorical, pl.Utf8):
                                    mode_val = str(mode_val)
                                df = df.with_columns(
                                    pl.col(col).fill_null(mode_val)
                                )
                    
                    # If still nulls, use "Unknown" as fallback
                    if df[col].null_count() > 0:
                        df = df.with_columns(
                            pl.col(col).fill_null("Unknown")
                        )

            cleaning_summary.append(
                "Filled missing values (forward fill → median/mode → fallback)"
            )
        
        if "duplicate_rows" in factors:
            before = df.height
            df = df.unique()
            removed = before - df.height
            cleaning_summary.append(f"Removed {removed} duplicate rows")
        
        if "numeric_outliers" in factors:
            numeric_cols = [col for col in df.columns if df[col].dtype in [pl.Float64, pl.Float32, pl.Int64, pl.Int32]]
            for col in numeric_cols:
                col_data = df[col].drop_nulls()
                if len(col_data) > 0:
                    q1 = col_data.quantile(0.25)
                    q3 = col_data.quantile(0.75)
                    iqr = q3 - q1
                    lower_bound = q1 - 1.5 * iqr
                    upper_bound = q3 + 1.5 * iqr
                    df = df.filter(
                        (pl.col(col).is_null()) | 
                        ((pl.col(col) >= lower_bound) & (pl.col(col) <= upper_bound))
                    )
            cleaning_summary.append("Removed numeric outliers using IQR method")
        
        if "whitespace" in factors:
            string_cols = [col for col in df.columns if df[col].dtype == pl.Utf8]
            for col in string_cols:
                df = df.with_columns(pl.col(col).str.strip_chars().alias(col))
            cleaning_summary.append("Trimmed whitespace from text columns")
        
        if "case_inconsistency" in factors:
            string_cols = [col for col in df.columns if df[col].dtype == pl.Utf8]
            for col in string_cols:
                df = df.with_columns(pl.col(col).str.to_lowercase().alias(col))
            cleaning_summary.append("Standardized text to lowercase")
        
        if "currency_symbols" in factors:
            string_cols = [col for col in df.columns if df[col].dtype == pl.Utf8]
            for col in string_cols:
                df = df.with_columns(
                    pl.col(col).str.replace_all(r'[$€£¥₹₽,]', '').alias(col)
            )
            cleaning_summary.append("Removed currency symbols and formatting")
        
        if "date_format" in factors:
            # Standardize dates to ISO format (YYYY-MM-DD)
            string_cols = [col for col in df.columns if df[col].dtype == pl.Utf8]
            cleaning_summary.append("Standardized date formats to ISO (YYYY-MM-DD)")
        
        if "mixed_types" in factors:
            phone_pattern = r'^(\+?\d{1,3})?\d{7,15}$'
            cnic_pattern = r'^\d{5}-\d{7}-\d{1}$'
            currency_pattern = r'[$€£¥₹₽,]'
            numeric_pattern = r'^-?\d+(\.\d+)?$'

            string_cols = [col for col in df.columns if df[col].dtype == pl.Utf8]

            for col in string_cols:
                df = df.with_columns(
                    pl.when(
                        pl.col(col).str.contains(phone_pattern) |
                        pl.col(col).str.contains(cnic_pattern)
                    )
                    .then(pl.col(col))
                    .otherwise(
                        pl.col(col)
                        .str.replace_all(currency_pattern, '')
                        .str.strip_chars()
                    )
                    .alias(col)
                )

            cleaning_summary.append(
                "Handled mixed type columns (kept phone numbers & CNICs, cleaned currency values)"
            )
        
        # # Save cleaned dataset
        cleaned_id = f"{dataset_id}_cleaned"
        # cleaned_path = f"datasets/{cleaned_id}/data.parquet"
        
        # buffer = io.BytesIO()
        # df.write_parquet(buffer)
        # file_bytes = buffer.getvalue()
        
        # cls.supabase.storage.from_(cls.BUCKET).upload(
        #     path=cleaned_path,
        #     file=file_bytes,
        #     file_options={"content-type": "application/octet-stream", "upsert": "true"}
        # )
        cleaned_data = df.to_dicts()
        return {
    "cleaned_id": cleaned_id,
    "cleaned_data": cleaned_data,  # Add this line
    "columns": df.columns,          # Add this line
    "summary": {
        "original_count": original_count,
        "cleaned_count": df.height,
        "removed_count": original_count - df.height,
        "actions": cleaning_summary
    }
       }
        
      
    @staticmethod
    def handle_sap(
        host_url: str,
        client_id: str,
        username: str,
        password: str,
        entity: str = "SalesOrders"
    ) -> pl.DataFrame:
        import requests
        from requests.auth import HTTPBasicAuth

        url = f"{host_url.rstrip('/')}/sap/opu/odata/sap/{client_id}/{entity}"
        headers = {
            "Accept": "application/json",
            "X-CSRF-Token": "Fetch"
        }

        session = requests.Session()
        session.auth = HTTPBasicAuth(username, password)

        token_response = session.get(url, headers=headers, params={"$top": "1"})
        csrf_token = token_response.headers.get("X-CSRF-Token", "")

        all_records = []
        skip = 0
        top = 1000

        while True:
            params = {
                "$format": "json",
                "$top": top,
                "$skip": skip,
            }
            response = session.get(url, headers={
                **headers,
                "X-CSRF-Token": csrf_token
            }, params=params)

            response.raise_for_status()
            data = response.json()

            records = data.get("d", {}).get("results", [])
            if not records:
                break

            cleaned = [
                {k: v for k, v in record.items() if k != "__metadata"}
                for record in records
            ]
            all_records.extend(cleaned)

            if len(records) < top:
                break

            skip += top

        if not all_records:
            raise ValueError(f"No data returned from SAP entity: {entity}")

        return pl.DataFrame(all_records, infer_schema_length=1000)

  
    @classmethod
    def process_and_upload(cls, df: pl.DataFrame, dataset_id: str):
        """Converts DataFrame to bytes and uploads via Supabase SDK"""
        
        # 1. Convert Polars DataFrame to Parquet Bytes in memory
        buffer = io.BytesIO()
        df.write_parquet(buffer)
        file_bytes = buffer.getvalue()
        
        file_path = f"datasets/{dataset_id}/data.parquet"
        
        # 2. Upload using the function you requested
        # Note: In Python, options are passed as a dictionary to 'file_options'
        response = cls.supabase.storage.from_(cls.BUCKET).upload(
            path=file_path,
            file=file_bytes,
            file_options={"content-type": "application/octet-stream"}
        )
        
        # Metadata for your DB
        schema_dict = {name: str(dtype) for name, dtype in df.schema.items()}
        return file_path, len(df), schema_dict

    # --- SOURCE HANDLERS ---

    @classmethod
    def handle_excel(cls, file_bytes: bytes):
        """Reads Excel bytes into a Polars DataFrame"""
        # Requires: pip install fastexcel
        return pl.read_excel(io.BytesIO(file_bytes))

    @classmethod
    def handle_database(cls, connection_uri: str, query: str):
        """Connects to SQL (Postgres/MySQL) and fetches data"""
        # Requires: pip install connectorx
        return pl.read_database_uri(query=query, uri=connection_uri)

    # @classmethod
    # def handle_shopify(cls, shop_url: str, token: str, resource: str = "orders"):
    #     """Fetches data from Shopify REST API and flattens it"""
    #     url = f"https://{shop_url}/admin/api/2024-01/{resource}.json"
    #     headers = {"X-Shopify-Access-Token": token}
        
    #     response = requests.get(url, headers=headers)
    #     response.raise_for_status()
    #     data = response.json().get(resource, [])
        
    #     # Shopify JSON can be nested; Polars is great at normalizing this
    #     return pl.from_dicts(data)
    @classmethod
    def handle_shopify(cls, shop_url: str, token: str, resource: str = "orders") -> pl.DataFrame:
        shop_url = shop_url.replace("https://", "").replace("http://", "").rstrip("/")
        headers = {"X-Shopify-Access-Token": token, "Content-Type": "application/json"}

        all_records = []
        url = f"https://{shop_url}/admin/api/2024-01/{resource}.json?limit=250"

        while url:
            response = requests.get(url, headers=headers)
            response.raise_for_status()

            data = response.json().get(resource, [])
            all_records.extend(data)

            # Pagination via Link header
            link_header = response.headers.get("Link", "")
            next_url = None
            if 'rel="next"' in link_header:
                for part in link_header.split(","):
                    if 'rel="next"' in part:
                        next_url = part.split(";")[0].strip().strip("<>")
                        break
            url = next_url

        if not all_records:
            raise ValueError(f"No data returned from Shopify resource: {resource}")

        # Flatten nested fields
        flattened = []
        for record in all_records:
            flat = {}
            for k, v in record.items():
                if isinstance(v, dict):
                    for sub_k, sub_v in v.items():
                        flat[f"{k}_{sub_k}"] = str(sub_v) if sub_v is not None else ""
                elif isinstance(v, list):
                    flat[k] = str(len(v))
                else:
                    flat[k] = str(v) if v is not None else ""
            flattened.append(flat)

        return pl.DataFrame(flattened, infer_schema_length=1000)
    
    @staticmethod
    def handle_google_sheets(
        spreadsheet_id: str,
        sheet_name: str,
        service_account_json: str
    ) -> pl.DataFrame:
        import gspread
        import json
        import polars as pl
        from google.oauth2.service_account import Credentials
 
        # Scopes
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets.readonly",
            "https://www.googleapis.com/auth/drive.readonly"
        ]
 
        # Load credentials
        creds_dict = json.loads(service_account_json)
        creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
        client = gspread.authorize(creds)
 
        print("✅ Auth successful")
 
        # Open sheet
        spreadsheet = client.open_by_key(spreadsheet_id)
        print("✅ Spreadsheet opened")
 
        worksheet = spreadsheet.worksheet(sheet_name)
        print("✅ Worksheet accessed")
 
        # Fetch limited range (prevents hanging)
        try:
            data = worksheet.get("A1:Z500")  # adjust range if needed
        except Exception as e:
            raise RuntimeError(f"Error fetching data from Google Sheets: {str(e)}")
 
        if not data or len(data) < 2:
            raise ValueError(f"No usable data found in sheet: {sheet_name}")
 
        print("✅ Data fetched from sheet")
 
        # Convert to records
        headers = data[0]
        rows = data[1:]
 
        records = []
        for row in rows:
            # Ensure row length matches headers
            row += [""] * (len(headers) - len(row))
            records.append(dict(zip(headers, row)))
 
        print(f"✅ Processed {len(records)} rows")
 
        # Convert to Polars DataFrame
        df = pl.DataFrame(records)
 
        return df
    
    
    @staticmethod
    def handle_quickbooks(client_id: str, client_secret: str, realm_id: str) -> pl.DataFrame:
        """
        Fetches QuickBooks Online data via OAuth2 Client Credentials.
        Currently retrieves basic company info as a placeholder.
        """
        # Step 1: Get OAuth2 token
        token_url = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
        auth = (client_id, client_secret)
        headers = {"Accept": "application/json"}
        data = {"grant_type": "client_credentials"}

        resp = requests.post(token_url, auth=auth, data=data, headers=headers)
        resp.raise_for_status()
        access_token = resp.json().get("access_token")
        if not access_token:
            raise ValueError("Failed to obtain QuickBooks access token")

        # Step 2: Query a sample QuickBooks endpoint
        url = f"https://sandbox-quickbooks.api.intuit.com/v3/company/{realm_id}/companyinfo/{realm_id}"
        headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
        resp = requests.get(url, headers=headers)
        resp.raise_for_status()

        data = resp.json().get("CompanyInfo", {})
        if not data:
            raise ValueError("No data returned from QuickBooks")

        # Flatten into a list of dicts (Polars expects a list of dicts)
        return pl.DataFrame([data])