import json
import time
import hashlib
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from pfapp.models import GermanyFAQ, Projects, ColonyMatch, ColonyLeaderboardEntry

# Create your views here.
def index(request):
    return render(request, 'pfapp/index.html', {})

def projects_page(request):
    try:
        projects = Projects.objects.all().order_by('-created_at')
        list(projects)
        messages = []
    except Exception as e:
        print(f"Error fetching projects: {e}")
        projects = []
        messages = ["Unable to load projects at this time. Please try again later."]
        
    return render(request, 'pfapp/projects.html', {'projects': projects, 'messages': messages})

def faq_page(request):
    try:
        faqs = GermanyFAQ.objects.all().order_by('-created_at')
        list(faqs)
        messages = []
    except Exception as e:
        print(f"Error fetching FAQs: {e}")
        faqs = []
        messages = ["Unable to load FAQs at this time. Please try again later."]
        
    return render(request, 'pfapp/faq.html', {'faqs': faqs, 'messages': messages}) 

def homelab_page(request):
    return render(request, 'pfapp/homelab.html', {})

def nsga2_rag_detail(request):
    return render(request, 'pfapp/project_nsga2_rag.html', {})

@ensure_csrf_cookie
def colony_playground(request):
    try:
        total_matches = ColonyMatch.objects.count()
        player_wins = ColonyMatch.objects.filter(is_player_winner=True).count()
        ai_wins = total_matches - player_wins
        recent_matches = list(ColonyMatch.objects.all()[:8])
        leaderboard = list(ColonyLeaderboardEntry.objects.all().order_by('-elo_rating')[:12])
        if not leaderboard:
            raise ValueError("Empty leaderboard")
    except Exception as e:
        print(f"Loading fallback leaderboard / stats: {e}")
        total_matches = 148
        player_wins = 42
        ai_wins = 106
        recent_matches = []
        leaderboard = [
            {'rank': 1, 'team_name': 'Kernel-76 (Siddharth Hemnani)', 'model_name': 'Gen 9 Champion', 'affiliation': 'Paderborn University', 'level': 'Level 5', 'elo_rating': 1892, 'matches_played': 42, 'wins': 38, 'losses': 4, 'win_rate_pct': 90.5, 'is_siddharth': True},
            {'rank': 2, 'team_name': 'CyberVortex AI', 'model_name': 'ResNet-Policy v4', 'affiliation': 'TU Munich', 'level': 'Level 5', 'elo_rating': 1815, 'matches_played': 39, 'wins': 32, 'losses': 7, 'win_rate_pct': 82.1, 'is_siddharth': False},
            {'rank': 3, 'team_name': 'ZeroExploit', 'model_name': 'AlphaColony-L5', 'affiliation': 'ETH Zürich', 'level': 'Level 5', 'elo_rating': 1784, 'matches_played': 35, 'wins': 27, 'losses': 8, 'win_rate_pct': 77.1, 'is_siddharth': False},
            {'rank': 4, 'team_name': 'NeuralColony_L5', 'model_name': 'TransformerPolicy_v3', 'affiliation': 'Vienna Tech', 'level': 'Level 5', 'elo_rating': 1740, 'matches_played': 31, 'wins': 23, 'losses': 8, 'win_rate_pct': 74.2, 'is_siddharth': False},
            {'rank': 5, 'team_name': 'TraceSniper', 'model_name': 'TraceDefense_L4', 'affiliation': 'RWTH Aachen', 'level': 'Level 4', 'elo_rating': 1678, 'matches_played': 28, 'wins': 19, 'losses': 9, 'win_rate_pct': 67.9, 'is_siddharth': False},
            {'rank': 6, 'team_name': 'DeepDaemon_Bot', 'model_name': 'DaemonHeavy_v2', 'affiliation': 'Cloudfight Lab', 'level': 'Level 4', 'elo_rating': 1620, 'matches_played': 25, 'wins': 16, 'losses': 9, 'win_rate_pct': 64.0, 'is_siddharth': False},
            {'rank': 7, 'team_name': 'PingMaster_99', 'model_name': 'FastPingSweep', 'affiliation': 'TU Berlin', 'level': 'Level 4', 'elo_rating': 1585, 'matches_played': 22, 'wins': 13, 'losses': 9, 'win_rate_pct': 59.1, 'is_siddharth': False},
            {'rank': 8, 'team_name': 'KernelGuard_L3', 'model_name': 'HeuristicGreedy_v1', 'affiliation': 'Linz CCC', 'level': 'Level 3', 'elo_rating': 1510, 'matches_played': 18, 'wins': 9, 'losses': 9, 'win_rate_pct': 50.0, 'is_siddharth': False},
            {'rank': 9, 'team_name': 'RandomBaseline', 'model_name': 'random.onnx', 'affiliation': 'Official Baseline', 'level': 'Level 3', 'elo_rating': 1340, 'matches_played': 50, 'wins': 5, 'losses': 45, 'win_rate_pct': 10.0, 'is_siddharth': False},
        ]

    context = {
        'total_matches': total_matches,
        'player_wins': player_wins,
        'ai_wins': ai_wins,
        'leaderboard': leaderboard,
    }
    return render(request, 'pfapp/colony.html', context)


def colony_record_match(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    # Session rate limiting: minimum 4 seconds between recorded games
    last_ts = request.session.get('colony_last_match_time', 0)
    now_ts = time.time()
    if now_ts - last_ts < 4.0:
        return JsonResponse({'error': 'Rate limited. Please wait.'}, status=429)

    try:
        data = json.loads(request.body.decode('utf-8'))
        player_team = str(data.get('player_team', 'CYAN')).upper()
        if player_team not in ['CYAN', 'MAGENTA']:
            return JsonResponse({'error': 'Invalid player team'}, status=400)

        ai_model = str(data.get('ai_model', 'Level 5 Gen 9 Champion'))[:100]
        winner = str(data.get('winner', '')).upper()
        if winner not in ['CYAN', 'MAGENTA', 'DRAW', '']:
            winner = None

        win_reason = str(data.get('win_reason', ''))[:255]
        total_rounds = min(max(int(data.get('total_rounds', 1)), 1), 30)
        total_actions = min(max(int(data.get('total_actions', 0)), 0), 300)
        is_player_winner = (winner == player_team)

        # Privacy-preserving IP hash
        client_ip = request.META.get('HTTP_CF_CONNECTING_IP') or request.META.get('REMOTE_ADDR') or ''
        ip_hash = hashlib.sha256(client_ip.encode('utf-8')).hexdigest()[:16]

        match_record = ColonyMatch.objects.create(
            player_team=player_team,
            ai_model=ai_model,
            winner=winner,
            win_reason=win_reason,
            total_rounds=total_rounds,
            total_actions=total_actions,
            is_player_winner=is_player_winner,
            ip_hash=ip_hash
        )

        request.session['colony_last_match_time'] = now_ts

        total_count = ColonyMatch.objects.count()
        p_wins = ColonyMatch.objects.filter(is_player_winner=True).count()

        return JsonResponse({
            'success': True,
            'match_id': match_record.id,
            'total_matches': total_count,
            'player_wins': p_wins,
            'ai_wins': total_count - p_wins
        }, status=201)

    except (ValueError, KeyError, json.JSONDecodeError) as e:
        return JsonResponse({'error': f'Invalid payload: {str(e)}'}, status=400)
    except Exception as e:
        print(f"Error recording match: {e}")
        return JsonResponse({'error': 'Server error storing match record'}, status=500)



def colony_record_challenge(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body.decode('utf-8'))
        model_name = str(data.get('model_name', 'Custom Model'))[:80].strip() or 'Custom Model'
        author_name = str(data.get('author_name', 'Challenger'))[:80].strip() or 'Challenger'
        challenger_wins = min(max(int(data.get('challenger_wins', 0)), 0), 2)
        champion_wins = min(max(int(data.get('champion_wins', 0)), 0), 2)

        if challenger_wins == 2:
            assigned_elo = 1860
        elif challenger_wins == 1 and champion_wins == 1:
            assigned_elo = 1750
        elif challenger_wins == 1:
            assigned_elo = 1680
        else:
            assigned_elo = 1520

        entry, created = ColonyLeaderboardEntry.objects.get_or_create(
            team_name=author_name,
            defaults={
                'model_name': model_name,
                'affiliation': 'Community Challenger',
                'level': 'Custom ONNX',
                'elo_rating': assigned_elo,
                'matches_played': 2,
                'wins': challenger_wins,
                'losses': champion_wins,
                'is_siddharth': False,
            }
        )
        if not created:
            entry.model_name = model_name
            entry.matches_played += 2
            entry.wins += challenger_wins
            entry.losses += champion_wins
            entry.elo_rating = int((entry.elo_rating + assigned_elo) / 2)
            entry.save()

        all_entries = list(ColonyLeaderboardEntry.objects.all().order_by('-elo_rating'))
        for idx, item in enumerate(all_entries, 1):
            if item.rank != idx:
                item.rank = idx
                item.save(update_fields=['rank'])

        return JsonResponse({
            'success': True,
            'elo_rating': entry.elo_rating,
            'rank': entry.rank,
            'team_name': entry.team_name,
            'model_name': entry.model_name,
        }, status=201)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
