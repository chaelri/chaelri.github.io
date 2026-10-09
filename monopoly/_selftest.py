#!/usr/bin/python3
"""Plays random bot games against the engine and checks invariants after every action.

    python3 _selftest.py [games]
"""
import random
import sys

from game import Game, GameError, SQUARES, GROUP_SQ

N = int(sys.argv[1]) if len(sys.argv) > 1 else 500
T = [0.0]


def check(g):
    s = g.s
    for p in s["players"]:
        assert p["cash"] >= 0, ("negative cash", p)
        assert 0 <= p["pos"] < 40
    houses = hotels = 0
    for k, o in s["props"].items():
        assert not g.player(o["owner"])["out"], "out player owns " + k
        assert 0 <= o["houses"] <= 5
        if o["houses"]:
            assert SQUARES[int(k)]["type"] == "street"
            assert not o["mortgaged"]
        if o["houses"] == 5:
            hotels += 1
        else:
            houses += o["houses"]
    assert s["houses"] + houses == 32, (s["houses"], houses)
    assert s["hotels"] + hotels == 12
    for grp, sqs in GROUP_SQ.items():
        hs = [(g.prop(i) or {}).get("houses", 0) for i in sqs]
        assert max(hs) - min(hs) <= 1, ("uneven", grp, hs)
    for d in ("chance", "chest"):
        held = sum(p["cards"].count(d) for p in s["players"])
        assert len(s["decks"][d]) + held == 16, (d, len(s["decks"][d]), held)
    if s["phase"] == "play":
        assert not g.cur()["out"] or s["stage"] == "debt"
        assert (s["stage"] == "debt") == bool(s["debts"]), (s["stage"], s["debts"])
        assert (s["stage"] == "auction") == bool(s["auction"])


def bot_step(g, rng):
    s = g.s
    act = g.active()
    # random side actions by anyone
    if rng.random() < 0.15:
        q = rng.choice(act)
        mine = g.owned_by(q["id"])
        if mine:
            i = rng.choice(mine)
            op = rng.choice([g.build, g.build, g.build, g.sell_house, g.mortgage, g.unmortgage])
            try:
                op(q, i)
            except GameError:
                pass
    if rng.random() < 0.03 and len(act) > 1:
        a, b = rng.sample(act, 2)
        try:
            t = g.propose(a, b["id"], rng.sample(g.owned_by(a["id"]), min(1, len(g.owned_by(a["id"])))),
                          rng.choice([0, 0, 50]), rng.sample(g.owned_by(b["id"]), min(1, len(g.owned_by(b["id"])))),
                          rng.choice([0, 0, 30]))
            g.respond(b, t["id"], rng.random() < 0.6)
        except GameError:
            pass
    if s["phase"] != "play":
        return
    st = s["stage"]
    p = g.cur()
    act = g.active()
    if st == "roll":
        if p["jailed"]:
            r = rng.random()
            try:
                if r < 0.2:
                    return g.jail_pay(p)
                if r < 0.3:
                    return g.jail_card(p)
            except GameError:
                pass
        return g.roll(p)
    if st == "buy":
        i = s["pending"]["sq"]
        if p["cash"] >= SQUARES[i]["price"] and rng.random() < 0.8:
            return g.buy(p)
        return g.decline(p)
    if st == "auction":
        a = s["auction"]
        q = rng.choice(act)
        r = rng.random()
        try:
            if r < 0.4 and q["cash"] > a["high"]:
                return g.bid(q, a["high"] + rng.choice([1, 10, 50]))
            if r < 0.8:
                return g.auction_pass(q)
        except GameError:
            pass
        T[0] += 3
        return g.tick()
    if st == "debt":
        d = s["debts"][0]
        q = g.player(d["from"])
        for i in g.owned_by(q["id"]):
            try:
                g.sell_house(q, i)
                return
            except GameError:
                pass
        for i in g.owned_by(q["id"]):
            try:
                g.mortgage(q, i)
                return
            except GameError:
                pass
        return g.bankrupt(q)
    if st == "done":
        return g.end_turn(p)
    raise AssertionError("stuck in stage " + st)


def main():
    lengths, wins_by_out = [], 0
    for n in range(N):
        rng = random.Random(n)
        g = Game(rng=random.Random(n + 999), clock=lambda: T[0])
        for k in range(rng.randint(2, 8)):
            g.join("P%d" % k)
        g.configure({"free_parking": n % 2 == 0})
        g.start()
        steps = 0
        while g.s["phase"] == "play" and steps < 6000:
            bot_step(g, rng)
            check(g)
            steps += 1
            T[0] += 0.1
        if g.s["phase"] == "over":
            wins_by_out += 1
        lengths.append(steps)
    lengths.sort()
    print("games %d  finished %d  median steps %d  max %d" % (N, wins_by_out, lengths[len(lengths) // 2], lengths[-1]))


if __name__ == "__main__":
    main()
