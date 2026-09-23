import { useCallback, useEffect, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { palette, s, gutter, line, family } from '../design/tokens';
import { Label, Body, Small, Data, DataSmall, Title } from '../design/type';
import { Gutter, Space, PressSurface, Rule } from '../design/layout';
import { social, REPORT_REASONS, type Review, type PlaceSocial, type ReportReason } from '../../src/core/api/social';
import { haptics } from '../../src/core/ux/haptics';
import { t } from '../../src/i18n';

interface Props {
  poiId: string;
}

const MAX_BODY = 600;
const STARS = [1, 2, 3, 4, 5];

/**
 * What other passengers made of this place.
 *
 * Loaded lazily and allowed to fail: at cruise there is no signal, and a place
 * card must never show an error where the reading should be. When the network
 * is gone this whole block simply is not there.
 */
export default function PlaceReviews({ poiId }: Props) {
  const [stats, setStats] = useState<PlaceSocial | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState({ rating: 0, body: '' });
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s1, r1] = await Promise.all([social.placeStats(poiId), social.reviews(poiId)]);
    setStats(s1);
    setReviews(r1?.reviews ?? null);
    setLoading(false);
  }, [poiId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = useCallback(async () => {
    if (mine.rating < 1) return;
    setSending(true);
    const ok = await social.writeReview(poiId, mine.rating, mine.body.trim() || undefined);
    ok ? haptics.success() : haptics.error();
    setMine({ rating: 0, body: '' });
    setSending(false);
    await load();
  }, [poiId, mine, load]);

  const report = useCallback(async (reviewId: string, reason: ReportReason) => {
    setReporting(null);
    await social.reportReview(reviewId, reason);
    haptics.light?.();
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.amber} />
      </View>
    );
  }

  // No network, or the place has never been reached — say nothing rather than
  // showing an empty shell that looks broken.
  if (!stats && !reviews) return null;

  return (
    <View style={styles.block}>
      {stats ? (
        <>
          <Gutter>
            <Label tone="dim">{t('reviews.title')}</Label>
          </Gutter>
          <Space h={s.x3} />
          <View style={styles.summary}>
            <View style={styles.summaryCell}>
              <Data allowFontScaling={false}>{stats.discoveries}</Data>
              <Space h={s.x1} />
              <Label numberOfLines={1}>{t('reviews.discoveredBy')}</Label>
            </View>
            <View style={[styles.summaryCell, styles.summaryDivider]}>
              <Data tone={stats.rating ? 'accent' : 'muted'} allowFontScaling={false}>
                {stats.rating ? stats.rating.toFixed(1) : '—'}
              </Data>
              <Space h={s.x1} />
              <Label numberOfLines={1}>{t('reviews.rating')}</Label>
            </View>
            <View style={styles.summaryCell}>
              <Data allowFontScaling={false}>
                {stats.rarity > 0 ? `${(stats.rarity * 100).toFixed(1)}%` : '—'}
              </Data>
              <Space h={s.x1} />
              <Label numberOfLines={1}>{t('reviews.rarity')}</Label>
            </View>
          </View>
        </>
      ) : null}

      {/* Write */}
      <Space h={s.x6} />
      <Gutter>
        <Label tone="accent">{t('reviews.yours')}</Label>
        <Space h={s.x3} />
        <View style={styles.stars}>
          {STARS.map((n) => (
            <Pressable
              key={n}
              onPress={() => {
                haptics.light?.();
                setMine((m) => ({ ...m, rating: n }));
              }}
              accessibilityRole="button"
              accessibilityLabel={`${n}`}
              style={({ pressed }) => [
                styles.star,
                n <= mine.rating && styles.starOn,
                pressed && styles.starPressed
              ]}
            >
              <DataSmall tone={n <= mine.rating ? 'accent' : 'dim'} allowFontScaling={false}>
                {n}
              </DataSmall>
            </Pressable>
          ))}
        </View>
        <Space h={s.x3} />
        <TextInput
          value={mine.body}
          onChangeText={(v) => setMine((m) => ({ ...m, body: v.slice(0, MAX_BODY) }))}
          placeholder={t('reviews.placeholder')}
          placeholderTextColor={palette.inkDim}
          multiline
          style={styles.input}
          accessibilityLabel={t('reviews.placeholder')}
        />
      </Gutter>
      <Space h={s.x3} />
      <PressSurface
        onPress={submit}
        accessibilityLabel={t('reviews.publish')}
        style={styles.submit}
      >
        {sending ? (
          <ActivityIndicator color={palette.amber} />
        ) : (
          <Label tone={mine.rating > 0 ? 'accent' : 'dim'}>{t('reviews.publish')}</Label>
        )}
      </PressSurface>

      {/* Read */}
      {reviews && reviews.length > 0 ? (
        <>
          <Space h={s.x6} />
          {reviews.map((r) => (
            <View key={r.id} style={styles.review}>
              <Gutter>
                <View style={styles.reviewHead}>
                  <Title numberOfLines={1} style={styles.author}>
                    {r.author.handle ?? t('reviews.anonymous')}
                  </Title>
                  <DataSmall tone="accent" allowFontScaling={false}>
                    {'★'.repeat(r.rating)}
                  </DataSmall>
                </View>
                {r.body ? (
                  <>
                    <Space h={s.x2} />
                    <Body tone="muted">{r.body}</Body>
                  </>
                ) : null}
                <Space h={s.x3} />
                <View style={styles.reviewActions}>
                  <PressSurface
                    onPress={() => social.voteReview(r.id)}
                    accessibilityLabel={t('reviews.helpful')}
                    style={styles.action}
                  >
                    <Label tone="dim">
                      {t('reviews.helpful')}
                      {r.helpful > 0 ? ` · ${r.helpful}` : ''}
                    </Label>
                  </PressSurface>
                  <PressSurface
                    onPress={() => setReporting(reporting === r.id ? null : r.id)}
                    accessibilityLabel={t('reviews.report')}
                    style={styles.action}
                  >
                    <Label tone="dim">{t('reviews.report')}</Label>
                  </PressSurface>
                </View>

                {/* Reporting is required for user content; the reasons are fixed
                    so a moderator can triage without reading every note. */}
                {reporting === r.id ? (
                  <>
                    <Space h={s.x3} />
                    <View style={styles.reasons}>
                      {REPORT_REASONS.map((reason) => (
                        <PressSurface
                          key={reason}
                          onPress={() => report(r.id, reason)}
                          accessibilityLabel={t(`reviews.reason_${reason}`)}
                          style={styles.reason}
                        >
                          <Small>{t(`reviews.reason_${reason}`)}</Small>
                        </PressSurface>
                      ))}
                    </View>
                  </>
                ) : null}
              </Gutter>
              <Space h={s.x4} />
              <Rule soft />
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: s.x10 },
  loading: { paddingVertical: s.x8, alignItems: 'center' },

  summary: {
    flexDirection: 'row',
    borderTopWidth: line.hair,
    borderBottomWidth: line.hair,
    borderColor: palette.rule
  },
  summaryCell: { flex: 1, alignItems: 'center', paddingVertical: s.x3 },
  summaryDivider: {
    borderLeftWidth: line.hair,
    borderRightWidth: line.hair,
    borderColor: palette.rule
  },

  stars: { flexDirection: 'row', gap: s.x2 },
  star: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: line.hair,
    borderColor: palette.rule
  },
  starOn: { borderColor: palette.amber, backgroundColor: palette.warm },
  starPressed: { backgroundColor: palette.lifted },

  input: {
    minHeight: 76,
    borderWidth: line.hair,
    borderColor: palette.rule,
    backgroundColor: palette.raised,
    padding: s.x3,
    color: palette.ink,
    fontFamily: family.text,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top'
  },
  submit: {
    alignItems: 'center',
    paddingVertical: s.x4,
    borderTopWidth: line.hair,
    borderBottomWidth: line.hair,
    borderColor: palette.rule,
    backgroundColor: palette.raised
  },

  review: {},
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s.x3 },
  author: { flexShrink: 1 },
  reviewActions: { flexDirection: 'row', gap: s.x5 },
  action: { paddingVertical: s.x1 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: s.x2 },
  reason: {
    paddingHorizontal: s.x3,
    paddingVertical: s.x2,
    borderWidth: line.hair,
    borderColor: palette.rule
  }
});
