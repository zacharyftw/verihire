#!/usr/bin/env python3
"""Download and convert code quality training data from vulnerability datasets.

This script uses datasets that contain BOTH good and bad code:
1. Devign - Functions labeled as vulnerable/safe from real projects
2. BigVul - CVE-linked vulnerable functions with fixed versions

This gives us actual examples of bad code (security vulnerabilities) to train on,
not just "good" code from MBPP/HumanEval.

Usage:
    python download_codesearchnet.py --output_dir ../data --max_samples 10000
"""

import argparse
import json
import random
import re
from pathlib import Path
from typing import Any


def download_devign_dataset(max_samples: int) -> list[dict]:
    """Download Devign dataset - functions labeled vulnerable (1) or safe (0)."""
    from datasets import load_dataset  # type: ignore

    print("Loading Devign dataset (vulnerable vs safe functions)...")
    samples = []

    try:
        # Devign is part of CodeXGLUE
        dataset = load_dataset("code_x_glue_cc_defect_detection", split="train")

        for item in dataset:
            if len(samples) >= max_samples:
                break

            code = item.get("func", "")
            is_vulnerable = item.get("target", 0)  # 1 = vulnerable, 0 = safe

            if code and len(code) > 50:
                samples.append(
                    {
                        "code": code,
                        "is_vulnerable": bool(is_vulnerable),
                        "language": "c",  # Devign is mostly C/C++
                        "source": "devign",
                        "vulnerability_label": is_vulnerable,
                    }
                )

        print(f"  Got {len(samples)} samples from Devign")
        # Show distribution
        vuln_count = sum(1 for s in samples if s["is_vulnerable"])
        print(f"  Distribution: {vuln_count} vulnerable, {len(samples) - vuln_count} safe")

    except Exception as e:
        print(f"  Devign failed: {e}")

    return samples


def download_bigvul_dataset(max_samples: int) -> list[dict]:
    """Download BigVul dataset - real CVE vulnerabilities with before/after."""
    from datasets import load_dataset  # type: ignore

    print("Loading BigVul dataset (CVE-linked vulnerabilities)...")
    samples = []

    try:
        # Try different BigVul sources
        try:
            dataset = load_dataset("benjis/bigvul", split="train")
        except Exception:
            dataset = load_dataset("bstee615/bigvul", split="train")

        for item in dataset:
            if len(samples) >= max_samples:
                break

            # BigVul has vulnerable and fixed versions
            vuln_code = item.get("func_before", "") or item.get("vulnerable_code", "")
            fixed_code = item.get("func_after", "") or item.get("fixed_code", "")

            # Add vulnerable version (bad code)
            if vuln_code and len(vuln_code) > 50:
                samples.append(
                    {
                        "code": vuln_code,
                        "is_vulnerable": True,
                        "language": "c",
                        "source": "bigvul",
                        "cwe": item.get("cwe", ""),
                        "cve": item.get("cve_id", ""),
                        "vulnerability_label": 1,
                    }
                )

            # Add fixed version (good code)
            if fixed_code and len(fixed_code) > 50 and len(samples) < max_samples:
                samples.append(
                    {
                        "code": fixed_code,
                        "is_vulnerable": False,
                        "language": "c",
                        "source": "bigvul_fixed",
                        "cwe": item.get("cwe", ""),
                        "cve": item.get("cve_id", ""),
                        "vulnerability_label": 0,
                    }
                )

        print(f"  Got {len(samples)} samples from BigVul")
        vuln_count = sum(1 for s in samples if s["is_vulnerable"])
        print(f"  Distribution: {vuln_count} vulnerable, {len(samples) - vuln_count} safe")

    except Exception as e:
        print(f"  BigVul failed: {e}")

    return samples


def download_python_code_with_issues(max_samples: int) -> list[dict]:
    """Download Python code samples - mix of good and intentionally bad code."""
    from datasets import load_dataset  # type: ignore

    print("Loading Python code samples...")
    samples = []

    # Load MBPP for good Python examples
    try:
        print("  Loading MBPP (good code examples)...")
        mbpp = load_dataset("mbpp", split="train+test+validation")
        for item in mbpp:
            if len(samples) >= max_samples // 2:
                break
            code = item.get("code", "")
            if code and len(code) > 30:
                samples.append(
                    {
                        "code": code,
                        "is_vulnerable": False,
                        "language": "python",
                        "source": "mbpp",
                        "vulnerability_label": 0,
                    }
                )
        print(f"    Got {len(samples)} good Python samples from MBPP")
    except Exception as e:
        print(f"    MBPP failed: {e}")

    # Generate bad Python examples with security issues
    print("  Generating bad Python examples with security issues...")
    bad_python_examples = generate_bad_python_code()
    for example in bad_python_examples:
        if len(samples) >= max_samples:
            break
        samples.append(
            {
                "code": example["code"],
                "is_vulnerable": True,
                "language": "python",
                "source": "synthetic_vulnerable",
                "vulnerability_type": example["vulnerability_type"],
                "vulnerability_label": 1,
            }
        )

    print(f"  Total Python samples: {len(samples)}")
    return samples


def generate_bad_python_code() -> list[dict]:
    """Generate Python code examples with various security issues and bad practices."""
    bad_examples = [
        # eval() - arbitrary code execution
        {
            "code": """def process_user_input(user_input):
    result = eval(user_input)
    return result""",
            "vulnerability_type": "eval_injection",
        },
        {
            "code": """def calculate(expression):
    # Process math expression from user
    return eval(expression)""",
            "vulnerability_type": "eval_injection",
        },
        {
            "code": """class Calculator:
    def compute(self, formula):
        return eval(formula)""",
            "vulnerability_type": "eval_injection",
        },
        # exec() - code execution
        {
            "code": """def run_dynamic_code(code_string):
    exec(code_string)
    return "Code executed" """,
            "vulnerability_type": "exec_injection",
        },
        {
            "code": """def execute_plugin(plugin_code):
    namespace = {}
    exec(plugin_code, namespace)
    return namespace.get('result')""",
            "vulnerability_type": "exec_injection",
        },
        # SQL injection
        {
            "code": """def get_user(username):
    query = "SELECT * FROM users WHERE name = '" + username + "'"
    cursor.execute(query)
    return cursor.fetchone()""",
            "vulnerability_type": "sql_injection",
        },
        {
            "code": """def search_products(search_term):
    sql = f"SELECT * FROM products WHERE name LIKE '%{search_term}%'"
    return db.execute(sql)""",
            "vulnerability_type": "sql_injection",
        },
        {
            "code": """def delete_record(table, id):
    query = "DELETE FROM %s WHERE id = %s" % (table, id)
    cursor.execute(query)""",
            "vulnerability_type": "sql_injection",
        },
        # Command injection
        {
            "code": """import os
def list_files(directory):
    os.system("ls " + directory)""",
            "vulnerability_type": "command_injection",
        },
        {
            "code": """import subprocess
def ping_host(hostname):
    subprocess.call("ping -c 1 " + hostname, shell=True)""",
            "vulnerability_type": "command_injection",
        },
        # Hardcoded credentials
        {
            "code": """def connect_to_database():
    password = "supersecret123"
    return mysql.connect(host="db.example.com", password=password)""",
            "vulnerability_type": "hardcoded_credentials",
        },
        {
            "code": """API_KEY = "sk-1234567890abcdef"
def call_api(endpoint):
    return requests.get(endpoint, headers={"Authorization": API_KEY})""",
            "vulnerability_type": "hardcoded_credentials",
        },
        {
            "code": """class Config:
    DB_PASSWORD = "admin123"
    SECRET_KEY = "mysecretkey"
    AWS_SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCY" """,
            "vulnerability_type": "hardcoded_credentials",
        },
        # Pickle deserialization
        {
            "code": """import pickle
def load_user_data(data):
    return pickle.loads(data)""",
            "vulnerability_type": "insecure_deserialization",
        },
        {
            "code": """import pickle
def process_file(filepath):
    with open(filepath, 'rb') as f:
        return pickle.load(f)""",
            "vulnerability_type": "insecure_deserialization",
        },
        # YAML unsafe load
        {
            "code": """import yaml
def parse_config(config_string):
    return yaml.load(config_string)""",
            "vulnerability_type": "insecure_deserialization",
        },
        # Path traversal
        {
            "code": """def read_file(filename):
    with open("/var/data/" + filename) as f:
        return f.read()""",
            "vulnerability_type": "path_traversal",
        },
        {
            "code": """def serve_file(request):
    filepath = request.args.get('file')
    return send_file(filepath)""",
            "vulnerability_type": "path_traversal",
        },
        # Weak cryptography
        {
            "code": """import hashlib
def hash_password(password):
    return hashlib.md5(password.encode()).hexdigest()""",
            "vulnerability_type": "weak_crypto",
        },
        {
            "code": """import random
def generate_token():
    return str(random.randint(100000, 999999))""",
            "vulnerability_type": "weak_random",
        },
        # SSL verification disabled
        {
            "code": """import requests
def fetch_data(url):
    return requests.get(url, verify=False)""",
            "vulnerability_type": "ssl_bypass",
        },
        # Debug mode enabled
        {
            "code": """app = Flask(__name__)
app.config['DEBUG'] = True
app.config['SECRET_KEY'] = 'dev'""",
            "vulnerability_type": "debug_enabled",
        },
        # Poor error handling exposing info
        {
            "code": """def login(username, password):
    try:
        user = db.get_user(username)
        if user.password != password:
            raise Exception(f"Wrong password for {username}")
    except Exception as e:
        return str(e)""",
            "vulnerability_type": "information_disclosure",
        },
        # Mass assignment
        {
            "code": """def update_user(user_id, **kwargs):
    user = User.query.get(user_id)
    for key, value in kwargs.items():
        setattr(user, key, value)
    db.session.commit()""",
            "vulnerability_type": "mass_assignment",
        },
        # No input validation
        {
            "code": """def transfer_money(from_account, to_account, amount):
    from_account.balance -= amount
    to_account.balance += amount
    db.commit()""",
            "vulnerability_type": "missing_validation",
        },
        # Timing attack vulnerable
        {
            "code": """def check_token(provided, actual):
    if provided == actual:
        return True
    return False""",
            "vulnerability_type": "timing_attack",
        },
        # SSRF
        {
            "code": """def fetch_url(url):
    response = requests.get(url)
    return response.text""",
            "vulnerability_type": "ssrf",
        },
        # XXE
        {
            "code": """from xml.etree import ElementTree
def parse_xml(xml_string):
    return ElementTree.fromstring(xml_string)""",
            "vulnerability_type": "xxe",
        },
    ]

    # Add variations of each
    expanded = []
    for example in bad_examples:
        expanded.append(example)
        # Add minor variations
        if "def " in example["code"]:
            var = example["code"].replace("def ", "def unsafe_")
            expanded.append({"code": var, "vulnerability_type": example["vulnerability_type"]})

    return expanded


def analyze_code_quality(
    code: str, language: str, is_vulnerable: bool = False, vulnerability_label: int = 0
) -> dict[str, float]:
    """Analyze code and derive quality scores using REAL static analysis.

    Uses radon for cyclomatic complexity and maintainability index,
    plus comprehensive readability and security analysis.

    This replaces the old heuristic-based approach that couldn't differentiate
    between good and bad code for complexity/readability/maintainability.
    """
    # Import real metrics module
    from real_metrics import calculate_real_metrics

    return calculate_real_metrics(
        code=code,
        language=language,
        is_vulnerable=is_vulnerable,
        vulnerability_label=vulnerability_label,
    )


def convert_to_code_quality(raw_samples: list[dict]) -> list[dict]:
    """Convert raw code samples to our code quality format."""
    samples = []

    for item in raw_samples:
        code = item.get("code", "")
        if not code or len(code) < 20:
            continue

        language = item.get("language", "python")
        is_vulnerable = item.get("is_vulnerable", False)
        vulnerability_label = item.get("vulnerability_label", 0)

        labels = analyze_code_quality(
            code, language, is_vulnerable=is_vulnerable, vulnerability_label=vulnerability_label
        )

        sample = {
            "code": code,
            "language": language,
            "labels": labels,
            "metadata": {
                "source": item.get("source", ""),
                "is_vulnerable": is_vulnerable,
                "vulnerability_type": item.get("vulnerability_type", ""),
                "cwe": item.get("cwe", ""),
            },
        }
        samples.append(sample)

    return samples


def split_data(samples: list[dict], train_ratio: float = 0.8, val_ratio: float = 0.1):
    """Split samples into train/val/test sets."""
    random.shuffle(samples)

    n = len(samples)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    return {
        "train": samples[:train_end],
        "val": samples[train_end:val_end],
        "test": samples[val_end:],
    }


def save_splits(splits: dict, output_dir: Path):
    """Save train/val/test splits as JSON files."""
    output_dir.mkdir(parents=True, exist_ok=True)

    for split_name, samples in splits.items():
        output_path = output_dir / f"code_quality_{split_name}.json"
        with open(output_path, "w") as f:
            json.dump(samples, f, indent=2)
        print(f"Saved {len(samples)} samples to {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Download code quality training data with vulnerabilities"
    )
    parser.add_argument("--output_dir", type=str, default="./data", help="Output directory")
    parser.add_argument(
        "--max_samples", type=int, default=10000, help="Maximum samples to download"
    )
    parser.add_argument(
        "--include_python", action="store_true", default=True, help="Include Python samples"
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)

    print("\n" + "=" * 60)
    print("Code Quality Training Data (with Vulnerability Labels)")
    print("=" * 60)
    print("\nDatasets: Devign, BigVul, MBPP + Synthetic Vulnerable Python")
    print("=" * 60 + "\n")

    all_samples = []

    # Download Devign (C/C++ vulnerable vs safe)
    devign_samples = download_devign_dataset(args.max_samples // 3)
    all_samples.extend(devign_samples)

    # Download BigVul (CVE vulnerabilities)
    bigvul_samples = download_bigvul_dataset(args.max_samples // 3)
    all_samples.extend(bigvul_samples)

    # Python samples (MBPP good + synthetic bad)
    if args.include_python:
        python_samples = download_python_code_with_issues(args.max_samples // 3)
        all_samples.extend(python_samples)

    print(f"\nTotal raw samples: {len(all_samples)}")

    # Show distribution
    vuln_count = sum(1 for s in all_samples if s.get("is_vulnerable", False))
    safe_count = len(all_samples) - vuln_count
    print(
        f"Distribution: {vuln_count} vulnerable ({vuln_count * 100 // len(all_samples)}%), {safe_count} safe ({safe_count * 100 // len(all_samples)}%)"
    )

    # Convert to training format
    converted = convert_to_code_quality(all_samples)
    print(f"Converted {len(converted)} samples")

    # Split and save
    splits = split_data(converted)
    save_splits(splits, output_dir)

    print("\nDone! Code quality training data ready.")
    print(f"  Train: {len(splits['train'])} samples")
    print(f"  Val: {len(splits['val'])} samples")
    print(f"  Test: {len(splits['test'])} samples")

    # Print quality score distribution
    print("\nQuality score distribution (train set):")
    for metric in ["complexity", "readability", "maintainability", "security", "best_practices"]:
        scores = [s["labels"][metric] for s in splits["train"]]
        avg = sum(scores) / len(scores)
        print(f"  {metric}: avg={avg:.2f}, min={min(scores):.2f}, max={max(scores):.2f}")

    # Show security score by vulnerability status
    print("\nSecurity scores by vulnerability status:")
    vuln_security = [
        s["labels"]["security"] for s in splits["train"] if s["metadata"].get("is_vulnerable")
    ]
    safe_security = [
        s["labels"]["security"] for s in splits["train"] if not s["metadata"].get("is_vulnerable")
    ]
    if vuln_security:
        print(f"  Vulnerable code: avg={sum(vuln_security) / len(vuln_security):.2f}")
    if safe_security:
        print(f"  Safe code: avg={sum(safe_security) / len(safe_security):.2f}")


if __name__ == "__main__":
    main()
