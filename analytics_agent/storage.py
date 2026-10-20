import os
from typing import Dict, Optional, Tuple

from dotenv import load_dotenv

load_dotenv()


def require_env(*names: str) -> Dict[str, str]:
    """
    Returns the given env vars, or raises at startup listing every missing one.
    """
    values = {name: os.getenv(name) for name in names}
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise RuntimeError(
            f"Missing required environment variable(s): {', '.join(missing)}. "
            "Set them in analytics_agent/.env (see .env.example) or in your host's env settings."
        )
    return values

S3_ENV_VARS = {
    "aws_endpoint_url": "SUPABASE_S3_ENDPOINT",
    "aws_region": "SUPABASE_S3_REGION",
    "aws_access_key_id": "SUPABASE_S3_ACCESS_KEY_ID",
    "aws_secret_access_key": "SUPABASE_S3_SECRET_ACCESS_KEY",
}


def is_production() -> bool:
    return os.getenv("APP_ENV", "").strip().lower() == "production"


def get_s3_storage_options() -> Optional[Dict[str, str]]:
    """
    Builds Polars storage_options for Supabase Storage's S3-compatible endpoint
    from env vars. Returns None if any of them is missing.
    """
    opts = {key: os.getenv(env) for key, env in S3_ENV_VARS.items()}
    if not all(opts.values()):
        return None
    # Supabase needs path-style URLs (endpoint/bucket/key). This is the key Polars
    # actually reads; unknown keys like "use_path_style" are silently ignored.
    opts["aws_virtual_hosted_style_request"] = "false"
    return opts


def get_dataset_s3_source(bucket: str, dataset_id: str) -> Optional[Tuple[str, Dict[str, str]]]:
    """
    Returns (s3_path, storage_options) for a dataset's parquet file,
    or None if the S3 env vars are not configured.
    """
    opts = get_s3_storage_options()
    if opts is None:
        return None
    return f"s3://{bucket}/datasets/{dataset_id}/data.parquet", opts
