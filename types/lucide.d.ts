// Augment lucide-react-native to accept color prop (SVG color attribute)
import 'lucide-react-native';

declare module 'lucide-react-native' {
    interface LucideProps {
        color?: string;
        stroke?: string;
    }
}
