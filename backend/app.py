from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

# save uploads inside backend/uploads
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB max upload

ALLOWED_EXTENSIONS = {
    "png", "jpg", "jpeg", "gif", "webp",
    "pdf", "doc", "docx", "txt", "csv", "xlsx"
}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def build_unique_filename(filename):
    safe_name = secure_filename(filename)
    name, ext = os.path.splitext(safe_name)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    return f"{name}_{timestamp}{ext}"


@app.route("/upload", methods=["POST"])
def upload():
    first_name = request.form.get("firstName", "").strip()
    last_name = request.form.get("lastName", "").strip()
    email = request.form.get("email", "").strip()

    photo_file = request.files.get("photoFile")
    info_file = request.files.get("infoFile")

    if not first_name or not last_name or not email:
        return jsonify({
            "success": False,
            "error": "Missing contact information."
        }), 400

    if not photo_file and not info_file:
        return jsonify({
            "success": False,
            "error": "No files were uploaded."
        }), 400

    saved_files = []

    try:
        if photo_file and photo_file.filename:
            if not allowed_file(photo_file.filename):
                return jsonify({
                    "success": False,
                    "error": "Invalid photo file type."
                }), 400

            photo_name = build_unique_filename(photo_file.filename)
            photo_path = os.path.join(app.config["UPLOAD_FOLDER"], photo_name)
            photo_file.save(photo_path)
            saved_files.append(photo_name)

        if info_file and info_file.filename:
            if not allowed_file(info_file.filename):
                return jsonify({
                    "success": False,
                    "error": "Invalid additional info file type."
                }), 400

            info_name = build_unique_filename(info_file.filename)
            info_path = os.path.join(app.config["UPLOAD_FOLDER"], info_name)
            info_file.save(info_path)
            saved_files.append(info_name)

        return jsonify({
            "success": True,
            "message": "Submission received successfully.",
            "firstName": first_name,
            "lastName": last_name,
            "email": email,
            "savedFiles": saved_files
        }), 200

    except Exception as error:
        return jsonify({
            "success": False,
            "error": f"Server error: {str(error)}"
        }), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)