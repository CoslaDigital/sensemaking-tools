# Sensemaker Visualizations Components by CoslaDigital

A collection of reusable visualization components for displaying Sensemaker data, built with D3.js and Web Components.

This package is maintained by Cosla as a fork of Jigsaw's original sensemaking-tools visualization library.

## Fork and Attribution

`@cosla/sensemaker-visualizations` is a maintained fork of Jigsaw's [sensemaking-tools visualization-library](https://github.com/Jigsaw-Code/sensemaking-tools/tree/main/visualization-library).

### Installation
```bash
npm install @cosla/sensemaker-visualizations
```

### Development
To run the Storybook development environment:
```bash
npm run storybook
```
This will start the Storybook server at `http://localhost:6006`. You can view and interact with all components in isolation.

> **Note:** The Storybook stories use sample data from the `stories/data` directory. To view all stories correctly, ensure you have both a `comments.json` and a `summary.json` file present in `stories/data/`.

### Building the Package
To build the package for production:
```bash
npm run build
```
The compiled files will be output to the `dist/` directory.

### Usage

Import the package once to register the custom elements:

```ts
import "@cosla/sensemaker-visualizations";
```

### Building Storybook Docs
To build the static Storybook documentation site:
```bash
npm run build-storybook
```
The static site will be output to the `storybook-static/` directory. You can deploy this directory to any static site host.

## Data Source and License

The data used in this demo was gathered using the [Polis software](https://compdemocracy.org/Polis/) and is sub-licensed under CC BY 4.0 with Attribution to The Computational Democracy Project. The data and more information about how the data was collected can be found at the following link:

[https://github.com/compdemocracy/openData/tree/master/american-assembly.bowling-green](https://github.com/compdemocracy/openData/tree/master/american-assembly.bowling-green)
