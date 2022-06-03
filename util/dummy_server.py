# ---------------------------------------------------------------------------------------------
# Copyright (c) Hitachi, Ltd. All rights reserved.
# Licensed under the MIT License. See LICENSE in the project root for license information.
# ---------------------------------------------------------------------------------------------

import argparse
import json
import time

from flask import Flask, jsonify, request

app = Flask(__name__)


def get_readme(data):
    def dict_to_string(data, indent=0):
        s = json.dumps(data, indent=2)
        lf = "\n"
        lf_indent = "\n" + (" " * indent)
        return s.replace(lf, lf_indent)

    orig_readme_text = data["prompt"]
    new_readme_text = f"""
# h1 Heading
## h2 Heading

### Data

```
{dict_to_string(data)}
```
"""

    # surrogate pairs, combining characters
    test_text = "𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡👍🏽👨‍👩‍👧‍👦"

    diff_list = []
    if len(orig_readme_text) >= 10:
        # "0123456789" --> "02𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡👍🏽👨‍👩‍👧‍👦356789"
        diff_list.append({"type": "deletion", "start": 1, "end": 2})
        diff_list.append({"type": "insertion", "start": 3, "text": test_text})
        diff_list.append({"type": "deletion", "start": 4, "end": 5})

    diff_list.append(
        {"type": "insertion", "start": len(orig_readme_text), "text": new_readme_text}
    )

    return (
        orig_readme_text[0]
        + orig_readme_text[2]
        + test_text
        + orig_readme_text[3]
        + orig_readme_text[5:]
        + new_readme_text,
        diff_list,
    )


@app.route("/generations", methods=["POST"])
def readme_generator():
    # mock a long running task
    time.sleep(5)

    readme_text, diff_list = get_readme(request.get_json())

    return {
        "id": "tmp-non-id",
        "model": request.form.get("model", ""),
        "choices": [
            {"text": readme_text, "edits": diff_list, "index": 0, "logprobs": 0.0}
        ],
    }


@app.route("/models", methods=["GET"])
def get_models():
    return {
        "data": [
            {"id": "gpt2", "description": "", "owned_by": ""},
            {"id": "gpt2-xl", "description": "", "owned_by": ""},
        ]
    }


@app.route("/health", methods=["GET"])
def get_health():
    return jsonify(None)


def create_parser():
    parser = argparse.ArgumentParser(description="")
    parser.add_argument("--port", type=int, required=False, default=8000)
    parser.add_argument("--debug", action="store_true")

    return parser


def main():
    parser = create_parser()
    parser_args = parser.parse_args()

    app.run(
        host="0.0.0.0",
        threaded=True,  # thread safe
        port=parser_args.port,
        debug=parser_args.debug,
    )


if __name__ == "__main__":
    main()
