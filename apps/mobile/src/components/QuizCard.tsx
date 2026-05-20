import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { haptics } from '../core/ux/haptics';
import type { Quiz } from '../core/quizzes/quizzes';

interface Props {
  quiz: Quiz;
  onClose: () => void;
}

export default function QuizCard({ quiz, onClose }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const correct = selectedIdx === quiz.correctIdx;

  const handleSelect = (idx: number) => {
    if (selectedIdx !== null) return;
    setSelectedIdx(idx);
    if (idx === quiz.correctIdx) haptics.success();
    else haptics.error();
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>QUIZ TIME</Text>
      <Text style={styles.question}>{quiz.question}</Text>
      {quiz.options.map((opt, i) => {
        const isSelected = selectedIdx === i;
        const isCorrect = i === quiz.correctIdx;
        const showResult = selectedIdx !== null;
        return (
          <Pressable
            key={i}
            style={[
              styles.option,
              isSelected && (correct ? styles.optionCorrect : styles.optionWrong),
              showResult && isCorrect && !isSelected && styles.optionCorrect
            ]}
            onPress={() => handleSelect(i)}
            disabled={selectedIdx !== null}
          >
            <Text style={styles.optionText}>{opt}{showResult && isCorrect ? ' ✓' : ''}</Text>
          </Pressable>
        );
      })}
      {selectedIdx !== null && (
        <View style={styles.explanationBox}>
          <Text style={styles.explanation}>{quiz.explanation}</Text>
          <Pressable style={styles.nextBtn} onPress={onClose}>
            <Text style={styles.nextBtnText}>Next</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 100,
    left: 12,
    right: 12,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 2,
    borderColor: colors.accent,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10
  },
  label: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5
  },
  question: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22
  },
  option: {
    backgroundColor: colors.surfaceElevated,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  optionCorrect: {
    backgroundColor: colors.success + '33',
    borderColor: colors.success
  },
  optionWrong: {
    backgroundColor: colors.error + '33',
    borderColor: colors.error
  },
  optionText: {
    color: colors.text,
    fontSize: 14
  },
  explanationBox: {
    marginTop: 8,
    gap: 10
  },
  explanation: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  nextBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center'
  },
  nextBtnText: {
    color: colors.text,
    fontWeight: '700'
  }
});
