# VSCode Extension for LARCH

This is a VS Code extension for generating README. It calls the REST API of [LARCH](https://github.com/hitachi-nlp/larch) to generate the README file.

## Usage

### Installation

1. Download the package (VSIX file) from the following URL:
   - https://github.com/hitachi-nlp/larch-vscode/releases

2. Install the downloaded package using one of the following methods:
   - Select "Install from VSIX..." from the dropdown menu in the Extensions view.
   - Execute the "Extensions: Install from VSIX..." command from the Command Palette.
   - Run the following command in the command line: `code --install-extension <vsix file>`.

### Configuration

1. Open the "Settings" page.
2. Select "Extensions > LARCH".
3. Specify the URL of the LARCH server's REST API in the "Rest API" field.

### Execution

1. Open the project for which you want to generate the README file in VS Code.

2. Execute the "LARCH" command from the Command Palette.
   1. You will be prompted for the project name (the default value is the repository name or the project's root directory name).
   2. The list of available models will be displayed. Select the desired model.
   3. After a while, the generated README file will be displayed in the editor.

### Known Issues

1. While the generated README file is being displayed in the editor, interrupting the process by switching to other files may cause issues.

## Development

### Development Environment

- VS Code (tested with v1.73.1)
- Node.js (tested with v16.15.0)
- Python (optional, used only to run a dummy web server)

### Development Process

1. Clone the project.
   ```
   $ git clone https://github.com/hitachi-nlp/larch-vscode.git larch
   $ cd larch
   ```

2. Install the dependencies.
   ```
   $ npm install
   ```

3. If you want to use the dummy web server, start it.
   The dummy REST API can be accessed at `http://localhost:8000/`.
   ```
   $ pip install flask
   $ python util/dummy_server.py
   ```

4. Open the project in VS Code.

5. Edit the source code and configuration files.

6. Run the extension.
   1. Select "[Run] > [Start Debugging]".
   2. In the newly opened window, execute the "LARCH" command from the Command Palette.

### Package (VSIX File) Creation Process

1. Install the package creation tool.
   ```
   $ npm install --location=global @vscode/vsce
   ```

2. Generate the package.
   This will create a file named "larch-0.0.4.vsix" in the current directory.
   ```
   $ vsce package
   ```

## Memo

This project was initially created following the steps in the official website's [Get Started](https://code.visualstudio.com/api/get-started/your-first-extension) guide.

1. Install Yeoman and the Yeoman generator for VS Code extensions.
   ```
   $ npm install --location=global yo generator-code
   ```

2. Generate the project scaffold.
   Select the default values except for the project name.
   ```
   $ yo code
   ```

3. Install the following libraries to the generated scaffold.
   ```
   $ npm i node-fetch@2
   $ npm i npm-packlist
   $ npm i isbinaryfile
   $ npm i -D @types/node-fetch@2
   $ npm i -D @types/npm-packlist
   ```

## License

This plugin is distributed under MIT.
See [LICENSE](./LICENSE) for the full terms.

This plugin was derived from Yeoman generated code.
Please refer to [Git hash d69c08c](https://github.com/hitachi-nlp/larch-vscode/commit/d69c08c) for the original template.
