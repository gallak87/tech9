"""One original recessed emitter assembly shared by the four player ships."""
import math


def add_emitter_chamber(duct, annulus, beam, label, cx, cy, aft, rx, ry):
    """Three structural baffles carry a central emitter behind the outer collar.

    The dark hub has an open front so it cannot occlude the recessed source.
    The small active face shares the existing Power material and its runtime
    throttle/boost response. Nozzle origins and exterior envelopes are unchanged.
    All coordinates are in the builders' declared game-space metres.
    """
    duct('Recessed emitter hub ' + label, cx, cy,
         [(aft + .26, rx * .15, ry * .15),
          (aft + .32, rx * .225, ry * .225),
          (aft + .41, rx * .24, ry * .24)],
         'edge', False, True, .004)
    for index in range(3):
        angle = .22 + index * math.tau / 3
        x, y = math.cos(angle), math.sin(angle)
        beam('Emitter support baffle ' + label + str(index),
             (cx + x * rx * .22, cy + y * ry * .22, aft + .36),
             (cx + x * rx * .61, cy + y * ry * .61, aft + .39),
             rx * .16, rx * .115, 'edge', .003)
    annulus('Emitter face retaining bezel ' + label, cx, cy, aft + .253,
            (rx * .152, ry * .152), (rx * .112, ry * .112),
            'darkmetal', .0015, .024)
    duct('Active recessed ion emitter ' + label, cx, cy,
         [(aft + .272, rx * .11, ry * .11),
          (aft + .296, rx * .115, ry * .115)],
         'cyan', True, True, .002)
