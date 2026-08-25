import React from "react";
import { Linking, View } from "react-native";
import Markdown from "@ronradtke/react-native-markdown-display";
import { useRouter } from "expo-router";
import { useTheme } from "../lib/theme";
import { pestDiseasePath, resolveMarkdownLinkAction } from "../lib/pestDiseaseRouting";

type Props = {
    children: string;
    style?: object;
    onPropagationLinkPress?: (methodCode: string) => void;
};

// Standard markdown renderer for plant descriptions. Kept in one place so the
// description format contract (paragraphs, bullets, bold, emphasis) renders
// consistently across Library detail, Plant detail and future surfaces.
export function MarkdownText({ children, style, onPropagationLinkPress }: Props) {
    const theme = useTheme();
    const router = useRouter();
    const markdownStyle = {
        body: {
            color: theme.textSecondary,
            fontSize: 14,
            lineHeight: 22,
            ...(style as object),
        },
        paragraph: { marginTop: 0, marginBottom: 8 },
        heading1: { color: theme.text, fontSize: 18, fontWeight: "700" as const, marginTop: 8, marginBottom: 6 },
        heading2: { color: theme.text, fontSize: 16, fontWeight: "700" as const, marginTop: 8, marginBottom: 6 },
        heading3: { color: theme.text, fontSize: 15, fontWeight: "600" as const, marginTop: 6, marginBottom: 4 },
        bullet_list: { marginBottom: 8 },
        bullet_list_item: { marginBottom: 2 },
        bullet_list_icon: { color: theme.textSecondary },
        strong: { color: theme.text, fontWeight: "700" as const },
        em: { fontStyle: "italic" as const },
        link: { color: theme.primary },
        code_inline: { color: theme.text, backgroundColor: theme.accent },
    };

    return (
        <View style={{ marginBottom: 4 }}>
            <Markdown
                style={markdownStyle}
                onLinkPress={(url) => {
                    const action = resolveMarkdownLinkAction(url);
                    if (action.type === "pest_disease") {
                        router.push(pestDiseasePath(action.key, action.locale));
                        return false;
                    }
                    if (action.type === "propagation") {
                        // A canonical method page does not exist yet. Consumers may
                        // opt into navigation once that route is available; until
                        // then, prevent the OS from opening an unsupported scheme.
                        onPropagationLinkPress?.(action.methodCode);
                        return false;
                    }
                    if (action.type === "external") {
                        void Linking.openURL(action.url).catch(() => undefined);
                    }
                    return false;
                }}
            >
                {children}
            </Markdown>
        </View>
    );
}
