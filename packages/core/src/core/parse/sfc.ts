import CompilerDOM from "@vue/compiler-dom";
import { SourceMap, type VueCompilerOptions } from "@vue/language-core";
import { type Segment, toString } from "muggle-string";
import { extname } from "pathe";
import { toMappings } from "../shared";

const frontmatterRE = /^---[\s\S]*?\n---(?:\r?\n|$)/;
const codeBlockRE = /(?<=`{3})[\s\S]+?(?=`{3})/g;
const latexBlockRE = /(?<=\${2})[\s\S]+?(?=\${2})/g;
const codeSnippetRE = /^\s*<<<\s*.+/gm;
const sfcBlockRE = /<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g;
const inlineCodeRE = /(?<=`)[\s\S]+?(?=`)/g;
const angleBracketRE = /<[^\s:]*:\S*>/g;

export function createSFC(sourcePath: string, sourceText: string, vueCompilerOptions: VueCompilerOptions) {
    const sourceLang = extname(sourcePath);

    if (vueCompilerOptions.extensions.includes(sourceLang)) {
        return CompilerDOM.parse(sourceText, {
            comments: true,
            parseMode: "sfc",
            isNativeTag: () => true,
            isPreTag: () => true,
        });
    }
    else if (vueCompilerOptions.vitePressExtensions.includes(sourceLang)) {
        sourceText = sourceText
            .replace(frontmatterRE, (match) => " ".repeat(match.length))
            .replace(codeBlockRE, (match) => " ".repeat(match.length))
            .replace(latexBlockRE, (match) => " ".repeat(match.length))
            .replace(codeSnippetRE, (match) => " ".repeat(match.length));

        const codes: Segment[] = [];

        for (const { 0: text, index } of sourceText.matchAll(sfcBlockRE)) {
            codes.push([text, void 0, index]);
            codes.push("\n\n");
            sourceText = (
                sourceText.slice(0, index) + " ".repeat(text.length) + sourceText.slice(index + text.length)
            );
        }

        sourceText = sourceText
            .replace(inlineCodeRE, (match) => " ".repeat(match.length))
            .replace(angleBracketRE, (match) => " ".repeat(match.length));

        codes.push("<template>\n");
        codes.push([sourceText, void 0, 0]);
        codes.push("\n</template>");

        const mappings = toMappings(codes);
        const mapper = new SourceMap(mappings);
        const sfc = CompilerDOM.parse(toString(codes), {
            comments: true,
            parseMode: "sfc",
            isNativeTag: () => true,
            isPreTag: () => true,
        });

        for (const { tag, loc, innerLoc } of sfc.children as CompilerDOM.ElementNode[]) {
            const positions = [loc.start, loc.end, innerLoc!.start, innerLoc!.end];
            if (tag === "template") {
                for (const pos of positions) {
                    pos.offset -= mappings.at(-1)!.generatedOffsets[0];
                }
            }
            for (const pos of positions) {
                // eslint-disable-next-line no-unreachable-loop
                for (const [offset] of mapper.toSourceLocation(pos.offset)) {
                    pos.offset = offset;
                    break;
                }
            }
        }

        return sfc;
    }
    else {
        throw new Error(`[Vue] Unsupported file extension: ${sourceLang}`);
    }
}
